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
}