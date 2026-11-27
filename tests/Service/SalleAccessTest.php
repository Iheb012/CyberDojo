<?php

namespace App\Tests\Service;

use App\Service\SalleAccess;
use PHPUnit\Framework\TestCase;

final class SalleAccessTest extends TestCase
{
    /** @var list<string> */
    private const ROOMS = ['dojo', 'ctf', 'rewards', 'courses_lobby', 'hall',
        'course_web', 'course_crypto', 'course_osint', 'course_reseaux'];

    public function testKnownRoomIsAllowed(): void
    {
        $decision = (new SalleAccess(self::ROOMS))->decide('lobby');

        self::assertFalse($decision['autorise']);
        self::assertSame('Salle inconnue.', $decision['message']);

        $decision = (new SalleAccess(self::ROOMS))->decide('course_web');

        self::assertTrue($decision['autorise']);
        self::assertSame('Accès autorisé.', $decision['message']);
    }

    public function testRemovedTileMapIsRefused(): void
    {
        $decision = (new SalleAccess(self::ROOMS))->decide('lab-web');

        self::assertFalse($decision['autorise']);
        self::assertSame('Salle inconnue.', $decision['message']);
    }
}
