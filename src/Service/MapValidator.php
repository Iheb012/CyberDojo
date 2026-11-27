<?php

namespace App\Service;

/**
 * Static checks for the hand-painted v2 maps.
 *
 * Run with `bin/console app:maps:validate`. The reachability test rasterises
 * every wall on an 8 px grid, grows the walls by half the player's feet box,
 * then flood fills from the map spawn. A door, slot or interactable is faulty
 * when no reachable cell lies in its interaction reach.
 */
final class MapValidator
{
    private const GRID = 8;

    /** Derived from assets/game/characters/character_1.json at construction. */
    private int $reach = 40;
    private int $hitboxW = 16;
    private int $hitboxH = 10;

    /** @param list<string> $mapIds */
    public function __construct(
        private readonly string $projectDir,
        private readonly array $mapIds,
    ) {
        $file = $projectDir.'/assets/game/characters/character_1.json';
        if (!is_file($file)) {
            return;
        }

        try {
            $config = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return;
        }
        if (!is_array($config)) {
            return;
        }

        $default = $config['default'] ?? null;
        $variants = is_array($config['variants'] ?? null) ? $config['variants'] : [];
        $key = is_string($default) && isset($variants[$default]) ? $default : array_key_first($variants);
        $variant = is_array($variants[$key] ?? null) ? $variants[$key] : [];
        $hitbox = is_array($variant['hitbox'] ?? null) ? $variant['hitbox'] : [];

        $this->reach = max(1, (int) ($config['interaction']['reach'] ?? 40));
        $scale = (float) ($variant['playerScale'] ?? $variant['scale'] ?? 1);
        $this->hitboxW = max(1, (int) ceil((float) ($hitbox['w'] ?? 8) * $scale));
        $this->hitboxH = max(1, (int) ceil((float) ($hitbox['h'] ?? 5) * $scale));
    }

    /** @return array{errors: list<string>, report: list<string>, count: int} */
    public function validate(): array
    {
        $errors = [];
        $report = [];
        $maps = [];

        if (count($this->mapIds) !== count(array_unique($this->mapIds))) {
            $errors[] = 'La liste game.maps contient des identifiants en double.';
        }

        foreach ($this->mapIds as $id) {
            $file = $this->projectDir.'/assets/game/maps/'.$id.'.json';
            if (!is_file($file)) {
                $errors[] = sprintf('[%s] fichier introuvable : %s', $id, $file);
                continue;
            }

            try {
                $map = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException $exception) {
                $errors[] = sprintf('[%s] JSON invalide : %s', $id, $exception->getMessage());
                continue;
            }
            if (!is_array($map)) {
                $errors[] = sprintf('[%s] le JSON doit contenir un objet.', $id);
                continue;
            }

            $maps[$id] = $map;
            $this->validateMap($id, $map, $errors, $report);
        }

        $this->validateLinks($maps, $errors);

        $report[] = '';
        $report[] = sprintf('%d carte(s) contrôlée(s), %d erreur(s).', count($this->mapIds), count($errors));

        return ['errors' => $errors, 'report' => $report, 'count' => count($this->mapIds)];
    }

    /** @param list<string> $errors @param list<string> $report */
    private function validateMap(string $id, array $map, array &$errors, array &$report): void
    {
        if (($map['version'] ?? null) !== 2) {
            $errors[] = sprintf('[%s] "version" doit valoir 2.', $id);
        }
        if (($map['id'] ?? null) !== $id) {
            $errors[] = sprintf('[%s] l\'id du JSON (%s) ne correspond pas au fichier.', $id, $map['id'] ?? '?');
        }

        $width = (int) ($map['width'] ?? 0);
        $height = (int) ($map['height'] ?? 0);
        if ($width <= 0 || $height <= 0) {
            $errors[] = sprintf('[%s] width/height invalides.', $id);
            return;
        }

        $image = (string) ($map['image'] ?? '');
        $imageFile = $this->projectDir.'/public'.parse_url($image, PHP_URL_PATH);
        if (!is_file($imageFile)) {
            $errors[] = sprintf('[%s] image introuvable : %s', $id, $image);
        } else {
            $size = @getimagesize($imageFile);
            if ($size === false) {
                $errors[] = sprintf('[%s] image illisible : %s', $id, $image);
            } elseif ((int) $size[0] !== $width || (int) $size[1] !== $height) {
                $errors[] = sprintf(
                    '[%s] image %dx%d mais le JSON annonce %dx%d.',
                    $id, (int) $size[0], (int) $size[1], $width, $height,
                );
            }
        }

        $walls = $this->rects($map['walls'] ?? [], $id, 'walls', $errors, $width, $height);
        $doors = $this->rects($map['doors'] ?? [], $id, 'doors', $errors, $width, $height, 'rect');
        $slots = $this->rects($map['slots'] ?? [], $id, 'slots', $errors, $width, $height, 'rect');
        $interactables = $this->rects($map['interactables'] ?? [], $id, 'interactables', $errors, $width, $height, 'rect');

        $this->checkIds($map, $id, $errors);
        $spawn = $this->point($map['spawn'] ?? null, $id, 'spawn', $errors);
        if ($spawn !== null) {
            $this->checkBounds($spawn, $id, 'spawn', $width, $height, $errors);
            $this->checkFree($spawn, $id, 'spawn', $walls, $doors, $errors);
        }
        // Door spawns are checked in validateLinks(): they belong to the
        // destination room, not to this one.

        $reachable = $this->floodFill($map, $walls, $spawn);
        if ($spawn === null || $reachable === []) {
            $errors[] = sprintf('[%s] le spawn ne peut pas accueillir le personnage.', $id);
        } else {
            foreach ($doors as $door) {
                if (!$this->isReachable($door, 8, $reachable)) {
                    $errors[] = sprintf('[%s] porte "%s" inatteignable.', $id, $door['id']);
                }
            }
            foreach ($slots as $slot) {
                if (!$this->isReachable($slot, $this->reach, $reachable)) {
                    $errors[] = sprintf('[%s] slot "%s" inatteignable.', $id, $slot['id'] ?? '?');
                }
            }
            foreach ($interactables as $item) {
                if (!$this->isReachable($item, $this->reach, $reachable)) {
                    $errors[] = sprintf('[%s] interactable "%s" inatteignable.', $id, $item['id'] ?? '?');
                }
            }
        }

        $report[] = sprintf(
            '  %-16s %4dx%-4d murs=%2d portes=%d slots=%2d décor=%d cases=%5d',
            $id, $width, $height, count($walls), count($doors), count($slots),
            count($interactables), count($reachable['cells'] ?? []),
        );
    }

    /**
     * @param array<string, mixed> $map
     * @param list<string> $errors
     * @return list<array<string, mixed>>
     */
    private function rects(array $items, string $id, string $label, array &$errors, int $width, int $height, string $key = ''): array
    {
        $result = [];
        foreach ($items as $index => $item) {
            $name = $label.'['.$index.']';
            if (!is_array($item)) {
                $errors[] = sprintf('[%s] %s : objet manquant.', $id, $name);
                continue;
            }
            if ($key !== '') {
                $bounds = $item[$key] ?? null;
                if (!is_array($bounds)) {
                    $errors[] = sprintf('[%s] %s : rectangle manquant.', $id, $name);
                    continue;
                }
                // Keep id/to/facing/spawn from the outer object, coordinates
                // from its nested rect.
                $item = array_merge($item, $bounds);
            }
            $rect = [
                'x' => $item['x'] ?? null,
                'y' => $item['y'] ?? null,
                'w' => $item['w'] ?? null,
                'h' => $item['h'] ?? null,
                'id' => $item['id'] ?? null,
                'to' => $item['to'] ?? null,
                'facing' => $item['facing'] ?? null,
                'spawn' => $item['spawn'] ?? null,
            ];
            foreach (['x', 'y', 'w', 'h'] as $field) {
                if (!is_numeric($rect[$field])) {
                    $errors[] = sprintf('[%s] %s.%s invalide.', $id, $name, $field);
                    continue 2;
                }
                $rect[$field] = (int) $rect[$field];
            }
            if ($rect['x'] < 0 || $rect['y'] < 0 || $rect['w'] <= 0 || $rect['h'] <= 0
                || $rect['x'] + $rect['w'] > $width || $rect['y'] + $rect['h'] > $height) {
                $errors[] = sprintf(
                    '[%s] %s (%d,%d %dx%d) sort de l\'image %dx%d.',
                    $id, $name, $rect['x'], $rect['y'], $rect['w'], $rect['h'], $width, $height,
                );
            }
            $result[] = $rect;
        }

        return $result;
    }

    /** @param list<string> $errors @return array<string, mixed>|null */
    private function point(mixed $value, string $id, string $label, array &$errors): ?array
    {
        if (!is_array($value) || !is_numeric($value['x'] ?? null) || !is_numeric($value['y'] ?? null)) {
            $errors[] = sprintf('[%s] %s invalide.', $id, $label);
            return null;
        }

        return ['x' => (int) $value['x'], 'y' => (int) $value['y']];
    }

    /** @param list<string> $errors */
    private function checkBounds(array $point, string $id, string $label, int $width, int $height, array &$errors): void
    {
        if ($point['x'] < 0 || $point['y'] < 0 || $point['x'] >= $width || $point['y'] >= $height) {
            $errors[] = sprintf(
                '[%s] %s (%d,%d) sort de l\'image %dx%d.',
                $id, $label, $point['x'], $point['y'], $width, $height,
            );
        }
    }

    /**
     * @param array<string, mixed> $point
     * @param list<array<string, mixed>> $walls
     * @param list<array<string, mixed>> $doors
     * @param list<string> $errors
     */
    private function checkFree(array $point, string $id, string $label, array $walls, array $doors, array &$errors): void
    {
        $feet = [
            'x' => $point['x'] - $this->hitboxW / 2,
            'y' => $point['y'] - $this->hitboxH / 2,
            'w' => $this->hitboxW,
            'h' => $this->hitboxH,
        ];
        foreach ($walls as $wall) {
            if ($this->overlap($feet, $wall)) {
                $errors[] = sprintf('[%s] %s (%d,%d) est dans un mur.', $id, $label, $point['x'], $point['y']);
                return;
            }
        }
        foreach ($doors as $door) {
            if ($this->contains($door, $point['x'], $point['y'])) {
                $errors[] = sprintf('[%s] %s (%d,%d) est dans une porte.', $id, $label, $point['x'], $point['y']);
                return;
            }
        }
    }

    /** @param array<string, mixed> $map @param list<string> $errors */
    private function checkIds(array $map, string $id, array &$errors): void
    {
        $seen = [];
        foreach (['doors', 'slots', 'interactables', 'npcs'] as $category) {
            foreach ($map[$category] ?? [] as $index => $item) {
                $itemId = is_array($item) ? ($item['id'] ?? null) : null;
                if (!is_string($itemId) || $itemId === '') {
                    $errors[] = sprintf('[%s] %s[%d] sans id.', $id, $category, $index);
                    continue;
                }
                $key = $category.':'.$itemId;
                if (isset($seen[$key])) {
                    $errors[] = sprintf('[%s] id dupliqué : %s.', $id, $key);
                }
                $seen[$key] = true;
            }
        }
    }

    /** @param array<string, array<string, mixed>> $maps @param list<string> $errors */
    private function validateLinks(array $maps, array &$errors): void
    {
        foreach ($maps as $id => $map) {
            foreach ($map['doors'] ?? [] as $door) {
                $target = is_array($door) ? ($door['to'] ?? null) : null;
                if (!is_string($target) || $target === '') {
                    $errors[] = sprintf('[%s] porte sans cible.', $id);
                    continue;
                }
                if (!isset($maps[$target])) {
                    $errors[] = sprintf('[%s] porte vers "%s" : carte inexistante.', $id, $target);
                    continue;
                }
                $back = null;
                foreach ($maps[$target]['doors'] ?? [] as $candidate) {
                    if (is_array($candidate) && ($candidate['to'] ?? null) === $id) {
                        $back = $candidate;
                        break;
                    }
                }
                if ($back === null) {
                    $errors[] = sprintf('[%s] "%s" n\'a pas de porte retour vers "%s".', $id, $target, $id);
                    continue;
                }

                $spawn = $door['spawn'] ?? null;
                if (!is_array($spawn) || !is_numeric($spawn['x'] ?? null) || !is_numeric($spawn['y'] ?? null)
                    || !is_array($back['rect'] ?? null)) {
                    continue; // already reported by validateMap()
                }

                // The arrival point is in the destination room.
                $targetWidth = (int) ($maps[$target]['width'] ?? 0);
                $targetHeight = (int) ($maps[$target]['height'] ?? 0);
                $arrival = ['x' => (int) $spawn['x'], 'y' => (int) $spawn['y']];
                $ignored = [];
                $targetWalls = $this->rects(
                    $maps[$target]['walls'] ?? [], $target, 'walls', $ignored,
                    $targetWidth, $targetHeight,
                );
                $targetDoors = $this->rects(
                    $maps[$target]['doors'] ?? [], $target, 'doors', $ignored,
                    $targetWidth, $targetHeight, 'rect',
                );
                $this->checkBounds(
                    $arrival, $id, 'porte '.$door['id'].' spawn', $targetWidth, $targetHeight, $errors,
                );
                $this->checkFree(
                    $arrival, $id, 'porte '.$door['id'].' spawn', $targetWalls, $targetDoors, $errors,
                );

                $centerX = (int) $back['rect']['x'] + (int) $back['rect']['w'] / 2;
                $centerY = (int) $back['rect']['y'] + (int) $back['rect']['h'] / 2;
                $dx = (int) $spawn['x'] - $centerX;
                $dy = (int) $spawn['y'] - $centerY;
                $facing = abs($dx) >= abs($dy)
                    ? ($dx >= 0 ? 'right' : 'left')
                    : ($dy >= 0 ? 'down' : 'up');
                if (($door['facing'] ?? null) !== $facing) {
                    $errors[] = sprintf(
                        '[%s] porte "%s" : facing "%s" mais le spawn est à "%s" de sa porte retour.',
                        $id, $door['id'] ?? '?', $door['facing'] ?? '?', $facing,
                    );
                }
                if (hypot($dx, $dy) > 400) {
                    $errors[] = sprintf('[%s] porte "%s" : spawn trop loin de la porte retour.', $id, $door['id'] ?? '?');
                }
            }
        }
    }

    /**
     * @param array<string, mixed> $map
     * @param list<array<string, mixed>> $walls
     * @param array<string, int>|null $spawn
     * @return array{cols: int, rows: int, cells: array<int, bool>}|array{}
     */
    private function floodFill(array $map, array $walls, ?array $spawn): array
    {
        if ($spawn === null) {
            return [];
        }

        $cols = (int) ceil((int) $map['width'] / self::GRID);
        $rows = (int) ceil((int) $map['height'] / self::GRID);
        $blocked = [];
        for ($y = 0; $y < $rows; $y += 1) {
            for ($x = 0; $x < $cols; $x += 1) {
                $cx = $x * self::GRID + self::GRID / 2;
                $cy = $y * self::GRID + self::GRID / 2;
                $blocked[$y][$x] = false;
                foreach ($walls as $wall) {
                    if ($cx >= $wall['x'] - $this->hitboxW / 2 && $cx <= $wall['x'] + $wall['w'] + $this->hitboxW / 2
                        && $cy >= $wall['y'] - $this->hitboxH / 2 && $cy <= $wall['y'] + $wall['h'] + $this->hitboxH / 2) {
                        $blocked[$y][$x] = true;
                        break;
                    }
                }
            }
        }

        $startX = max(0, min($cols - 1, intdiv($spawn['x'], self::GRID)));
        $startY = max(0, min($rows - 1, intdiv($spawn['y'], self::GRID)));
        if ($blocked[$startY][$startX]) {
            return [];
        }

        $seen = [];
        $queue = [[$startX, $startY]];
        $seen[$startY][$startX] = true;
        while ($queue !== []) {
            [$x, $y] = array_pop($queue);
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if ($nx < 0 || $ny < 0 || $nx >= $cols || $ny >= $rows
                    || $blocked[$ny][$nx] || isset($seen[$ny][$nx])) {
                    continue;
                }
                $seen[$ny][$nx] = true;
                $queue[] = [$nx, $ny];
            }
        }

        $cells = [];
        foreach ($seen as $row) {
            foreach ($row as $x => $_) {
                $cells[] = $x; // count only; coordinates are read from $seen below
            }
        }

        return ['cols' => $cols, 'rows' => $rows, 'cells' => $cells, 'seen' => $seen];
    }

    /** @param array{cols: int, rows: int, cells: array<int, bool>, seen: array<int, array<int, bool>>} $flood */
    private function isReachable(array $rect, int $pad, array $flood): bool
    {
        $x1 = max(0, intdiv((int) $rect['x'] - $pad, self::GRID));
        $x2 = min($flood['cols'] - 1, intdiv((int) $rect['x'] + (int) $rect['w'] + $pad, self::GRID));
        $y1 = max(0, intdiv((int) $rect['y'] - $pad, self::GRID));
        $y2 = min($flood['rows'] - 1, intdiv((int) $rect['y'] + (int) $rect['h'] + $pad, self::GRID));

        for ($y = $y1; $y <= $y2; $y += 1) {
            for ($x = $x1; $x <= $x2; $x += 1) {
                if (isset($flood['seen'][$y][$x])) {
                    return true;
                }
            }
        }

        return false;
    }

    /** @param array<string, mixed> $a @param array<string, mixed> $b */
    private function overlap(array $a, array $b): bool
    {
        return $a['x'] < $b['x'] + $b['w'] && $a['x'] + $a['w'] > $b['x']
            && $a['y'] < $b['y'] + $b['h'] && $a['y'] + $a['h'] > $b['y'];
    }

    /** @param array<string, mixed> $rect */
    private function contains(array $rect, int $x, int $y): bool
    {
        return $x >= $rect['x'] && $x <= $rect['x'] + $rect['w']
            && $y >= $rect['y'] && $y <= $rect['y'] + $rect['h'];
    }
}
