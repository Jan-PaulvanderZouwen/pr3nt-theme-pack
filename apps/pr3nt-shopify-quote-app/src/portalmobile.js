export function registerPortalMobileRoutes(app) {
  app.use('/portal/:token', (req, res, next) => {
    if (req.method !== 'GET') return next();

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (typeof body !== 'string') return originalSend(body);

      const css = `<style id="pr3nt-mobile-portal-css">
        @media (max-width: 600px) {
          html, body { overflow-x: hidden !important; }
          body { background: linear-gradient(180deg, #d8fff0 0%, #f7fbf9 42%, #ffffff 100%) !important; }
          .portal-shell, .portal-main, main {
            width: 100% !important;
            max-width: 100% !important;
            padding: 12px !important;
            box-sizing: border-box !important;
          }

          .portal-header {
            display: block !important;
            margin: 0 0 14px !important;
            padding: 18px !important;
            border-radius: 26px !important;
            background: rgba(255,255,255,.92) !important;
            box-shadow: 0 12px 34px rgba(16,24,32,.08) !important;
          }
          .portal-header .brand, .portal-header .logo, .portal-brand {
            margin-bottom: 18px !important;
          }
          .portal-header img, .portal-header svg {
            max-width: 54px !important;
            max-height: 54px !important;
          }
          .portal-header h1, .portal-header .brand strong, .portal-brand strong {
            font-size: 32px !important;
            line-height: 1 !important;
            letter-spacing: -0.055em !important;
          }

          .portal-nav {
            min-height: 0 !important;
            padding: 0 !important;
            gap: 8px !important;
            box-shadow: none !important;
            background: transparent !important;
            border-radius: 0 !important;
          }
          .portal-nav .nav-link:not(.account-icon), .portal-nav .nav-pill {
            width: 100% !important;
            flex: 1 1 100% !important;
            height: 42px !important;
            min-height: 42px !important;
            font-size: 16px !important;
            border-radius: 999px !important;
            padding: 0 14px !important;
          }
          .portal-nav .project-switcher {
            width: 100% !important;
            max-width: 100% !important;
            min-height: 40px !important;
            height: auto !important;
            padding: 0 !important;
            background: transparent !important;
            border: 0 !important;
            display: block !important;
          }
          .portal-nav .project-switcher span { display: none !important; }
          .portal-nav .project-switcher select {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 42px !important;
            line-height: 42px !important;
            padding: 0 14px !important;
            border-radius: 999px !important;
            background: #f4f7f6 !important;
            font-size: 14px !important;
            font-weight: 900 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .portal-nav .account-icon, .portal-nav a.account-icon, .portal-nav .nav-link.account-icon {
            display: none !important;
          }

          .status-hero {
            margin: 0 0 14px !important;
            padding: 22px 18px 18px !important;
            border-radius: 24px !important;
            box-shadow: 0 12px 34px rgba(16,24,32,.08) !important;
            overflow: hidden !important;
          }
          .status-hero .eyebrow, .eyebrow {
            font-size: 12px !important;
            letter-spacing: .14em !important;
          }
          .status-hero h1 {
            font-size: 34px !important;
            line-height: 1.02 !important;
            letter-spacing: -0.07em !important;
            margin: 14px 0 12px !important;
          }
          .status-hero p {
            font-size: 16px !important;
            line-height: 1.45 !important;
            margin-bottom: 14px !important;
          }
          .status-hero .progress, .progress {
            height: 8px !important;
            gap: 5px !important;
            margin: 14px 0 !important;
          }
          .status-hero .chips, .chips {
            gap: 8px !important;
            margin-top: 12px !important;
          }
          .status-hero .chip, .chip {
            padding: 8px 12px !important;
            font-size: 14px !important;
            line-height: 1 !important;
          }

          .status-hero .next-action {
            display: block !important;
            min-height: 0 !important;
            margin-top: 16px !important;
            padding: 18px !important;
            border-radius: 20px !important;
            text-align: left !important;
          }
          .status-hero .next-action h2, .status-hero .next-action strong {
            font-size: 26px !important;
            line-height: 1.1 !important;
          }
          .status-inner-card {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 14px !important;
            align-items: start !important;
            margin-top: 0 !important;
          }
          .status-inner-card > div:last-child {
            min-width: 0 !important;
          }
          .status-inner-card span {
            font-size: 20px !important;
            line-height: 1.2 !important;
            margin-bottom: 6px !important;
          }
          .status-inner-card small {
            font-size: 16px !important;
            line-height: 1.45 !important;
          }
          .mini-printer {
            width: 112px !important;
            height: 66px !important;
            flex-basis: auto !important;
          }

          .project-info-grid, .preview-messages-grid, .self-grid.pr3nt-managed-selfservice, .grid {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .project-info-grid .card, .preview-messages-grid .card, .self-card, .price-card, .card {
            border-radius: 22px !important;
            padding: 18px !important;
            min-height: 0 !important;
            box-shadow: 0 10px 28px rgba(16,24,32,.06) !important;
          }
          .project-info-grid .card h2, .preview-messages-grid .card h2, .card h2 {
            font-size: 24px !important;
            line-height: 1.12 !important;
            margin-bottom: 12px !important;
          }

          .project-info-grid table, .project-info-grid tbody, .project-info-grid tr, .project-info-grid td {
            display: block !important;
            width: 100% !important;
          }
          .project-info-grid tr {
            padding: 10px 0 !important;
            border-bottom: 1px solid #e5e7eb !important;
          }
          .project-info-grid td {
            padding: 0 !important;
            border: 0 !important;
            word-break: break-word !important;
          }
          .project-info-grid td:first-child {
            font-size: 11px !important;
            text-transform: uppercase !important;
            letter-spacing: .09em !important;
            color: #667085 !important;
            margin-bottom: 4px !important;
          }

          .btn, button, .btn-light, .btn-primary, label.btn {
            width: 100% !important;
            min-height: 44px !important;
            font-size: 14px !important;
          }
          canvas, model-viewer, .viewer, .model-viewer, #viewer {
            width: 100% !important;
            max-width: 100% !important;
            min-height: 260px !important;
            max-height: 340px !important;
            border-radius: 18px !important;
          }
          .pr3nt-file-carousel {
            gap: 8px !important;
            overflow-x: auto !important;
            padding-bottom: 6px !important;
          }
          .pr3nt-file-tile {
            width: 70px !important;
            height: 70px !important;
            min-width: 70px !important;
            border-radius: 16px !important;
          }
        }
      </style>`;

      const html = body.includes('id="pr3nt-mobile-portal-css"')
        ? body
        : body.replace('</head>', `${css}</head>`);

      return originalSend(html);
    };

    next();
  });
}
