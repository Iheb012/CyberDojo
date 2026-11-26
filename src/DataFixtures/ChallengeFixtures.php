<?php

namespace App\DataFixtures;

use App\Entity\Challenge;
use App\Service\FlagChecker;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;

class ChallengeFixtures extends Fixture
{
    public function __construct(private readonly FlagChecker $flags)
    {
    }

    public function load(ObjectManager $manager): void
    {
        $xss = $this->make($manager, 'Terminal XSS', 'facile', 10, 'terminal', 2, 1,
            "Ce terminal affiche votre message sans le filtrer.\nTrouvez le flag caché dans le message d'accueil.\nFormat du flag : CYBERDOJO{...}",
            'CYBERDOJO{xss_is_fun}', 'Regardez le code source de la page.', 5);

        $this->make($manager, 'Coffre Cookies', 'moyen', 20, 'coffre', 8, 1,
            "Le coffre se souvient de vous grâce à un cookie.\nModifiez-le pour devenir administrateur.",
            'CYBERDOJO{cookie_monster}');

        $this->make($manager, 'Serveur SQL', 'difficile', 50, 'serveur', 5, 3,
            "Ce serveur interroge sa base avec votre saisie.\nFaites-lui révéler ce qu'il cache.",
            'CYBERDOJO{sql_injection_101}', null, 0, $xss);

        $this->make($manager, 'Terminal CSRF', 'facile', 10, 'terminal', 1, 6,
            "Une action sensible n'est protégée par aucun jeton.\nTrouvez laquelle.",
            'CYBERDOJO{csrf_token_missing}');

        $manager->flush();
    }

    private function make(
        ObjectManager $manager, string $titre, string $difficulte, int $points, string $type,
        int $x, int $y, string $enonce, string $flag, ?string $indice = null, int $cout = 0,
        ?Challenge $prerequis = null,
    ): Challenge {
        $challenge = (new Challenge())
            ->setTitre($titre)->setDifficulte($difficulte)->setPoints($points)
            ->setTypeObjet($type)->setPosX($x)->setPosY($y)->setSalle('lab-web')
            ->setEnonce($enonce)->setFlagHash($this->flags->hash($flag))
            ->setIndice($indice)->setCoutIndice($cout)->setPrerequis($prerequis);
        $manager->persist($challenge);

        return $challenge;
    }
}