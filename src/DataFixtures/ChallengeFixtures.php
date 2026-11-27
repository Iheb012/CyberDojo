<?php

namespace App\DataFixtures;

use App\Entity\Challenge;
use App\Service\FlagChecker;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;

/**
 * One challenge per slot of the nine hand-painted rooms.
 *
 * The slot id is the bridge between server data and assets/game/maps/*.json:
 * EngineV2 draws a challenge at the centre of the slot rectangle whose id
 * matches the object's `slot`. No tile coordinates are used any more.
 */
class ChallengeFixtures extends Fixture
{
    public function __construct(private readonly FlagChecker $flags)
    {
    }

    public function load(ObjectManager $manager): void
    {
        $this->makeSlot($manager, 'dojo', 'dojo-01', 'Terminal du dojo', 'facile', 10, 'terminal',
            "Un terminal posé sur le tatami du dojo.\nTrouvez le premier flag pour commencer l'entraînement.",
            'CYBERDOJO{tatami_start}', 'Regardez le code source de la page.', 5);

        for ($i = 1; $i <= 20; $i += 1) {
            $slot = sprintf('ctf-%02d', $i);
            $this->makeSlot($manager, 'ctf', $slot, sprintf('Épreuve CTF %02d', $i),
                $i <= 7 ? 'facile' : ($i <= 14 ? 'moyen' : 'difficile'),
                $i <= 7 ? 10 : ($i <= 14 ? 20 : 30),
                ['terminal', 'coffre', 'serveur'][($i - 1) % 3],
                sprintf('Épreuve %02d de l’arène CTF. Récupérez le flag caché dans l’épreuve.', $i),
                sprintf('CYBERDOJO{ctf_%02d}', $i),
                $i % 5 === 0 ? 'Les indices sont souvent dans les commentaires du code.' : null, 5);
        }

        $this->makeSlot($manager, 'rewards', 'rewards-01', 'Ceinture noire', 'difficile', 50, 'serveur',
            'Le serveur qui garde la ceinture noire. Seuls les meilleurs obtiennent le flag.',
            'CYBERDOJO{black_belt}', 'Additionnez les points des épreuves précédentes.', 10);

        $this->loadCourse($manager, 'course_web', 'web', 9, 'Défi Web', 'terminal',
            'Trouvez la faille dans cette page web.');
        $this->loadCourse($manager, 'course_crypto', 'crypto', 8, 'Défi Crypto', 'coffre',
            'Déchiffrez le message pour révéler le flag.');
        $this->loadCourse($manager, 'course_osint', 'osint', 5, 'Défi OSINT', 'serveur',
            'Croisez les sources publiques pour retrouver le flag.');
        $this->loadCourse($manager, 'course_reseaux', 'reseaux', 4, 'Défi Réseaux', 'terminal',
            'Analysez le trafic réseau pour isoler le flag.');

        $manager->flush();
    }

    /**
     * Generates <prefix>-01 .. <prefix>-NN. The last OSINT slot is the central
     * table, drawn as osint-05 in course_osint.json.
     */
    private function loadCourse(
        ObjectManager $manager, string $salle, string $prefix, int $count,
        string $label, string $type, string $enonce,
    ): void {
        for ($i = 1; $i <= $count; $i += 1) {
            $this->makeSlot($manager, $salle, sprintf('%s-%02d', $prefix, $i),
                sprintf('%s %02d', $label, $i),
                $i <= 3 ? 'facile' : ($i <= 6 ? 'moyen' : 'difficile'),
                $i <= 3 ? 10 : ($i <= 6 ? 20 : 30),
                $type, $enonce,
                sprintf('CYBERDOJO{%s_%02d}', $prefix, $i),
                $i === 1 ? 'Commencez par observer les indices visibles dans la salle.' : null, 5);
        }
    }

    private function makeSlot(
        ObjectManager $manager, string $salle, string $slot, string $titre, string $difficulte,
        int $points, string $type, string $enonce, string $flag,
        ?string $indice = null, int $cout = 0,
    ): void {
        $challenge = (new Challenge())
            ->setTitre($titre)
            ->setDifficulte($difficulte)
            ->setPoints($points)
            ->setTypeObjet($type)
            ->setSalle($salle)
            ->setSlot($slot)
            ->setPosX(null)
            ->setPosY(null)
            ->setEnonce($enonce)
            ->setFlagHash($this->flags->hash($flag))
            ->setIndice($indice)
            ->setCoutIndice($cout);

        $manager->persist($challenge);
    }
}
