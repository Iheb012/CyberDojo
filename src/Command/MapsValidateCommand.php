<?php

namespace App\Command;

use App\Service\MapValidator;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:maps:validate',
    description: 'Valide les cartes v2 (images, rectangles, portes et accessibilité).',
)]
final class MapsValidateCommand extends Command
{
    public function __construct(private readonly MapValidator $validator)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $result = $this->validator->validate();

        $io->title('Validation des cartes v2');
        $io->text($result['report']);

        if ($result['errors'] !== []) {
            $io->error($result['errors']);

            return Command::FAILURE;
        }

        $io->success('Toutes les cartes sont valides.');

        return Command::SUCCESS;
    }
}
