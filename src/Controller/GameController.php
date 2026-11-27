<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class GameController extends AbstractController
{
    #[Route('/jeu', name: 'app_game')]
    public function index(): Response
    {
        // TODO: restrict to ROLE_USER once login exists (#[IsGranted('ROLE_USER')])
        return $this->render('game/index.html.twig');
    }

    /** Dev-only page showing every row of the character sprite sheets. */
    #[Route('/jeu/personnage-test', name: 'app_game_character_test')]
    public function characterTest(): Response
    {
        if (!$this->getParameter('kernel.debug')) {
            throw $this->createNotFoundException();
        }

        return $this->render('game/character-test.html.twig');
    }

    /**
     * Server-side gate for the F3 editor. The front-end also checks APP_ENV,
     * but a prod client must not be able to unlock it by changing a flag.
     */
    #[Route('/jeu/editeur', name: 'app_game_editor', methods: ['GET'])]
    public function editor(): Response
    {
        if (!$this->getParameter('kernel.debug')) {
            throw $this->createNotFoundException();
        }

        return $this->json(['autorise' => true]);
    }
}