<?php

namespace App\Tests\Command;

use App\Command\MapsValidateCommand;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;

final class MapsValidateCommandTest extends KernelTestCase
{
    public function testAllShippedMapsAreValid(): void
    {
        self::bootKernel();

        $application = new Application(self::$kernel);
        $command = self::getContainer()->get(MapsValidateCommand::class);
        self::assertInstanceOf(MapsValidateCommand::class, $command);
        $application->addCommand($command);

        $tester = new CommandTester($application->find('app:maps:validate'));
        $status = $tester->execute([]);
        $output = $tester->getDisplay();

        self::assertSame(Command::SUCCESS, $status, $output);
        self::assertStringContainsString('9 carte(s) contrôlée(s), 0 erreur(s).', $output);
        foreach (['dojo', 'ctf', 'rewards', 'courses_lobby', 'hall', 'course_web',
            'course_crypto', 'course_osint', 'course_reseaux'] as $id) {
            self::assertStringContainsString($id, $output);
        }
    }
}
