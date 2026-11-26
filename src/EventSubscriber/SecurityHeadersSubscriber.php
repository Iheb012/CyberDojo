<?php

namespace App\EventSubscriber;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Adds the security headers on every main response.
 *
 * The CSP nonce is generated once per request and exposed as the "csp_nonce"
 * request attribute so Twig can attach it to the inline import map.
 */
final class SecurityHeadersSubscriber implements EventSubscriberInterface
{
    public const NONCE_ATTRIBUTE = 'csp_nonce';

    public function __construct(
        #[Autowire('%kernel.environment%')]
        private readonly string $environment,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['onKernelRequest', 0],
            KernelEvents::RESPONSE => ['onKernelResponse', -256],
        ];
    }

    public function onKernelRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $event->getRequest()->attributes->set(
            self::NONCE_ATTRIBUTE,
            rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '='),
        );
    }

    public function onKernelResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();
        $response = $event->getResponse();
        $nonce = (string) $request->attributes->get(self::NONCE_ATTRIBUTE, '');
        $isDev = 'dev' === $this->environment;

        // Dev: the debug toolbar injects its own nonce and uses eval. Browsers
        // ignore 'unsafe-inline' when a nonce is present, so dev must not send
        // our nonce. Prod: strict nonce, no inline fallback.
        if ($isDev) {
            $scriptSrc = "'self' 'unsafe-inline' 'unsafe-eval'";
        } else {
            $scriptSrc = "'self'";
            if ('' !== $nonce) {
                $scriptSrc .= " 'nonce-{$nonce}'";
            }
        }

        // Turbo's progress bar writes inline styles through the CSSOM, which no
        // nonce can cover. Keep style-src permissive; script-src stays strict.
        $styleSrc = "'self' 'unsafe-inline'";

        $response->headers->set('Content-Security-Policy', implode('; ', [
            "default-src 'self'",
            "script-src {$scriptSrc}",
            "style-src {$styleSrc}",
            "img-src 'self' data:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
        ]));
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

        if ('prod' === $this->environment && $request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
    }
}
