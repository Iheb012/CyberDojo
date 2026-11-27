// Map and image loading for the hand-painted v2 rooms.
// Every JSON in assets/game/maps/ has "version": 2.

const mapCache = new Map();
const imageCache = new Map();

export async function fetchMap(url) {
  if (!mapCache.has(url)) {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Map ${url} returned ${response.status}`);
    }
    mapCache.set(url, await response.json());
  }

  return mapCache.get(url);
}

export function loadImage(url) {
  if (imageCache.has(url)) {
    return imageCache.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => {
      imageCache.delete(url);
      reject(new Error(`Image ${url} failed to load`));
    }, { once: true });
    image.src = url;
  });

  imageCache.set(url, promise);
  return promise;
}

/**
 * Warm the cache with the images of every reachable neighbour room.
 * Called after the current map is visible, so it never delays the first frame.
 *
 * @param {object} map current map
 * @param {Record<string, string>} maps map id -> map JSON url (from Twig)
 * @returns {Promise<void>}
 */
export async function preloadNeighbors(map, maps = {}) {
  const targets = [...new Set((map.doors ?? []).map((door) => door.to))]
    .filter((id) => id && maps[id]);

  await Promise.all(targets.map(async (id) => {
    try {
      const neighbor = await fetchMap(maps[id]);
      if (neighbor.image) {
        await loadImage(neighbor.image);
      }
    } catch (error) {
      // A missing neighbour must not break the room the player is in.
      console.warn(`Could not preload neighbour ${id}`, error);
    }
  }));
}
