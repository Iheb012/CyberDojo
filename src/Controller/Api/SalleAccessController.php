<?php

namespace App\Controller\Api;

use App\Service\SalleAccess;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/** Door transition endpoint for the v2 image maps. The server decides. */
final class SalleAccessController extends AbstractController
{
    public function __construct(private readonly SalleAccess $access)
    {
    }

    #[Route('/salles/{id}/acces', name: 'api_salle_acces', methods: ['POST'])]
    public function __invoke(string $id, Request $request): JsonResponse
    {
        if (!$this->isCsrfTokenValid('game', (string) $request->headers->get('X-CSRF-Token'))) {
            return $this->json([
                'autorise' => false,
                'message' => 'Jeton CSRF invalide.',
            ], 403);
        }

        return $this->json($this->access->decide($id));
    }
}
