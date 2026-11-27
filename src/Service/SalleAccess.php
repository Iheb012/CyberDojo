<?php

namespace App\Service;

/**
 * Decides whether a room door may be used.
 *
 * The known rooms come from config/packages/game.yaml, the same list the map
 * validator and the Twig template use. Progression is not implemented yet (the
 * old tile game had the same TODO), so every known room is open and unknown ids
 * are refused with a French message. The client never decides this on its own.
 */
final class SalleAccess
{
    /** @param list<string> $rooms */
    public function __construct(private readonly array $rooms)
    {
    }

    /** @return array{autorise: bool, message: string} */
    public function decide(string $id): array
    {
        if (!in_array($id, $this->rooms, true)) {
            return ['autorise' => false, 'message' => 'Salle inconnue.'];
        }

        // TODO: require the prerequisites solved by the current user once login exists.
        return ['autorise' => true, 'message' => 'Accès autorisé.'];
    }
}
