<?php

namespace App\Controller\Api;

use App\Entity\Challenge;
use App\Repository\ChallengeRepository;
use App\Service\FlagChecker;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;

// TODO (login): add #[IsGranted('ROLE_USER')] on this class once member A's login exists.
#[Route('/api/jeu')]
final class GameApiController extends AbstractController
{
    public function __construct(
        private readonly ChallengeRepository $challenges,
        private readonly FlagChecker $flagChecker,
    ) {
    }

    #[Route('/labs/{carte}/objets', name: 'api_jeu_objets', methods: ['GET'])]
    public function objets(string $carte): JsonResponse
    {
        $items = $this->challenges->findBy(['salle' => $carte, 'actif' => true]);

        return $this->json([
            'carte' => $carte,
            'mode' => 'libre',
            'objets' => array_map(fn (Challenge $c) => [
                'id' => $c->getId(),
                'titre' => $c->getTitre(),
                'typeObjet' => $c->getTypeObjet(),
                // Rooms place objects at the slot rectangle; posX/posY are kept
                // nullable in the payload for older clients.
                'slot' => $c->getSlot(),
                'posX' => $c->getPosX(),
                'posY' => $c->getPosY(),
                'etat' => $this->isLocked($c) ? 'verrouille' : 'disponible',
                'difficulte' => $c->getDifficulte(),
                'points' => $c->getPoints(),
            ], $items),
        ]);
    }

    #[Route('/challenges/{id<\d+>}', name: 'api_jeu_challenge', methods: ['GET'])]
    public function challenge(int $id): JsonResponse
    {
        $challenge = $this->guard($id);
        if ($challenge instanceof JsonResponse) {
            return $challenge;
        }

        // Never send: flagHash, the hint text. The hint has its own endpoint.
        return $this->json([
            'id' => $challenge->getId(),
            'titre' => $challenge->getTitre(),
            'difficulte' => $challenge->getDifficulte(),
            'points' => $challenge->getPoints(),
            'enonce' => $challenge->getEnonce(),
            'fichierJoint' => $challenge->getFichierJoint(),
            'aIndice' => $challenge->getIndice() !== null,
            'coutIndice' => $challenge->getCoutIndice(),
        ]);
    }

    #[Route('/challenges/{id<\d+>}/flag', name: 'api_jeu_flag', methods: ['POST'])]
    public function flag(int $id, Request $request, RateLimiterFactoryInterface $flagSubmissionLimiter): JsonResponse
    {
        if (!$this->csrfOk($request)) {
            return $this->json(['error' => 'Jeton CSRF invalide.'], 403);
        }
        $challenge = $this->guard($id);
        if ($challenge instanceof JsonResponse) {
            return $challenge;
        }

        // TODO (login): key on the user id instead of the IP address.
        $limit = $flagSubmissionLimiter->create($request->getClientIp().'-'.$id)->consume();
        if (!$limit->isAccepted()) {
            $wait = max(1, $limit->getRetryAfter()->getTimestamp() - time());

            return $this->json(['error' => 'Trop d\'essais.'], 429, ['Retry-After' => (string) $wait]);
        }

        $data = json_decode($request->getContent(), true);
        $flag = is_array($data) && is_string($data['flag'] ?? null) ? trim($data['flag']) : '';
        if ($flag === '' || strlen($flag) > 200) {
            return $this->json(['error' => 'Flag invalide.'], 400);
        }

        // TODO (step 6): save a Soumission and award points once.
        $correct = $this->flagChecker->check($challenge, $flag);

        return $this->json([
            'correct' => $correct,
            'message' => $correct ? 'Flag correct !' : 'Mauvais flag.',
        ]);
    }

    #[Route('/challenges/{id<\d+>}/indice', name: 'api_jeu_indice', methods: ['POST'])]
    public function indice(int $id, Request $request): JsonResponse
    {
        if (!$this->csrfOk($request)) {
            return $this->json(['error' => 'Jeton CSRF invalide.'], 403);
        }
        $challenge = $this->guard($id);
        if ($challenge instanceof JsonResponse) {
            return $challenge;
        }
        if ($challenge->getIndice() === null) {
            return $this->json(['error' => 'Pas d\'indice.'], 404);
        }

        // TODO (step 6): deduct the cost once and record an IndiceDebloque.
        return $this->json(['indice' => $challenge->getIndice(), 'coutIndice' => $challenge->getCoutIndice()]);
    }

    private function csrfOk(Request $request): bool
    {
        return $this->isCsrfTokenValid('game', (string) $request->headers->get('X-CSRF-Token'));
    }

    private function isLocked(Challenge $challenge): bool
    {
        // TODO (step 6): unlocked when the current user has solved the prerequisite.
        return $challenge->getPrerequis() !== null;
    }

    /** Returns the challenge, or the error response to send (404 unknown, 403 locked). */
    private function guard(int $id): Challenge|JsonResponse
    {
        $challenge = $this->challenges->find($id);
        if ($challenge === null || !$challenge->isActif()) {
            return $this->json(['error' => 'Challenge introuvable.'], 404);
        }
        if ($this->isLocked($challenge)) {
            return $this->json(['error' => 'Challenge verrouillé.'], 403);
        }

        return $challenge;
    }
}