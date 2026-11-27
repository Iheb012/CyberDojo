<?php

namespace App\Tests\Controller\Api;

use App\Controller\Api\GameApiController;
use App\Entity\Challenge;
use App\Repository\ChallengeRepository;
use App\Service\FlagChecker;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\JsonResponse;

final class GameApiControllerTest extends TestCase
{
    public function testObjetsPayloadExposesSlotAndNeverFlagHash(): void
    {
        $challenge = (new Challenge())
            ->setTitre('Terminal du dojo')
            ->setTypeObjet('terminal')
            ->setSlot('terminal-01')
            ->setPosX(null)
            ->setPosY(null)
            ->setFlagHash('a-secret-hash-that-must-not-be-sent');

        $repository = $this->createMock(ChallengeRepository::class);
        $repository->method('findBy')->willReturn([$challenge]);

        $payload = $this->payload($this->controller($repository)->objets('dojo'));
        $object = $payload['objets'][0];

        self::assertArrayHasKey('slot', $object);
        self::assertSame('terminal-01', $object['slot']);
        self::assertArrayNotHasKey('flagHash', $object);
        self::assertArrayNotHasKey('flag_hash', $object);
        // The keys remain in the payload for older clients, but stay null.
        self::assertArrayHasKey('posX', $object);
        self::assertArrayHasKey('posY', $object);
        self::assertNull($object['posX']);
        self::assertNull($object['posY']);
    }

    public function testObjetsPayloadWithoutSlotStaysCompatible(): void
    {
        $challenge = (new Challenge())
            ->setTitre('Terminal sans slot')
            ->setTypeObjet('terminal')
            ->setSalle('ctf');

        $repository = $this->createMock(ChallengeRepository::class);
        $repository->method('findBy')->willReturn([$challenge]);

        $object = $this->payload($this->controller($repository)->objets('ctf'))['objets'][0];

        self::assertArrayHasKey('slot', $object);
        self::assertNull($object['slot']);
        self::assertArrayHasKey('posX', $object);
        self::assertArrayHasKey('posY', $object);
        self::assertArrayNotHasKey('flagHash', $object);
    }

    public function testChallengePayloadStillHidesFlagHashAndHint(): void
    {
        $challenge = (new Challenge())
            ->setTitre('Terminal du dojo')
            ->setEnonce('Un énoncé')
            ->setIndice('Un indice secret')
            ->setFlagHash('another-secret-hash');

        $repository = $this->createMock(ChallengeRepository::class);
        $repository->method('find')->willReturn($challenge);

        $payload = $this->payload($this->controller($repository)->challenge(1));

        self::assertArrayNotHasKey('flagHash', $payload);
        self::assertArrayNotHasKey('flag_hash', $payload);
        self::assertArrayNotHasKey('indice', $payload);
        self::assertTrue($payload['aIndice']);
    }

    private function controller(ChallengeRepository $repository): GameApiController
    {
        $controller = new GameApiController($repository, new FlagChecker());
        // AbstractController::json() only needs a container when a serializer
        // service is registered; an empty one keeps these unit tests isolated.
        $controller->setContainer(new Container());

        return $controller;
    }

    /** @return array<string, mixed> */
    private function payload(JsonResponse $response): array
    {
        return json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }
}
