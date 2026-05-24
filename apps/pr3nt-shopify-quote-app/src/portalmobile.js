export function registerPortalMobileRoutes(app) {
  app.use('/portal/:token', (req, res, next) => {
    if (req.method !== 'GET') return next();

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (typeof body !== 'string') return originalSend(body);

      const css = `<style id="pr3nt-mobile-portal-css">
        @media (max-width: 700px) {
          html, body {
            overflow-x: hidden !important;
          }

          body {
            background: linear-gradient(180deg, #dcfff1 0%, #f7fbf9 38%, #ffffff 100%) !important;
          }

          .shell,
          .portal-shell,
          .portal-main,
          main {
            width: 100% !important;
            max-width: 100% !important;
            padding: 10px !important;
            box-sizing: border-box !important;
          }

          .portal-header {
            position: static !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            margin: 0 0 12px !important;
            padding: 14px !important;
            border-radius: 22px !important;
            background: rgba(255,255,255,.94) !important;
            box-shadow: 0 8px 26px rgba(16,24,32,.07) !important;
            border: 1px solid rgba(229,231,235,.9) !important;
          }

          .brand,
          .portal-brand,
          .portal-header .brand {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            margin: 0 !important;
            font-size: 28px !important;
            line-height: 1 !important;
            letter-spacing: -0.06em !important;
          }

          .logo-mark {
            width: 48px !important;
            height: 48px !important;
            min-width: 48px !important;
            border-radius: 16px !important;
            font-size: 27px !important;
          }

          .portal-nav {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            width: 100% !important;
            min-height: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .portal-nav .nav-link,
          .portal-nav .nav-pill,
          .nav-link,
          .nav-pill {
            width: 100% !important;
            height: 38px !important;
            min-height: 38px !important;
            padding: 0 12px !important;
            border-radius: 999px !important;
            font-size: 15px !important;
            font-weight: 900 !important;
            line-height: 38px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .portal-nav .nav-link[href$="/account"],
          .portal-nav .account-icon,
          .portal-nav a.account-icon,
          .portal-nav .nav-link.account-icon {
            display: none !important;
          }

          .project-switcher {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 38px !important;
            min-height: 38px !important;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            background: transparent !important;
            overflow: hidden !important;
          }

          .project-switcher span {
            display: none !important;
          }

          .project-switcher select {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 38px !important;
            line-height: 38px !important;
            padding: 0 14px !important;
            border: 0 !important;
            border-radius: 999px !important;
            background: #f4f7f6 !important;
            font-size: 14px !important;
            font-weight: 900 !important;
            color: #101820 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .status-hero {
            display: block !important;
            margin: 0 0 12px !important;
            padding: 18px !important;
            border-radius: 22px !important;
            background: rgba(255,255,255,.96) !important;
            box-shadow: 0 8px 26px rgba(16,24,32,.07) !important;
            overflow: hidden !important;
          }

          .status-hero .eyebrow,
          .eyebrow {
            font-size: 11px !important;
            letter-spacing: .14em !important;
            line-height: 1 !important;
          }

          .status-hero h1,
          h1 {
            font-size: 31px !important;
            line-height: 1.02 !important;
            letter-spacing: -0.07em !important;
            margin: 14px 0 10px !important;
          }

          .status-hero p {
            font-size: 15px !important;
            line-height: 1.45 !important;
            margin: 0 0 12px !important;
          }

          .segmented,
          .status-hero .progress,
          .progress {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 6px !important;
            margin: 12px 0 !important;
          }

          .segment,
          .progress > * {
            height: 9px !important;
            border-radius: 999px !important;
          }

          .inline-facts,
          .chips,
          .status-hero .chips {
            display: flex !important;
            gap: 7px !important;
            flex-wrap: wrap !important;
            margin: 12px 0 0 !important;
          }

          .inline-facts span,
          .chip,
          .status-hero .chip {
            padding: 7px 10px !important;
            border-radius: 999px !important;
            font-size: 13px !important;
            line-height: 1 !important;
            font-weight: 850 !important;
          }

          .next-action,
          .status-hero .next-action {
            display: grid !important;
            grid-template-columns: 1fr !important;
            align-items: start !important;
            justify-content: start !important;
            gap: 10px !important;
            min-height: 0 !important;
            margin-top: 14px !important;
            padding: 16px !important;
            border-radius: 18px !important;
            text-align: left !important;
          }

          .next-action > span,
          .status-hero .next-action > span {
            display: block !important;
            font-size: 23px !important;
            line-height: 1.1 !important;
            letter-spacing: -0.04em !important;
            margin: 0 !important;
          }

          .status-inner-card,
          .pr3nt-final-status {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            align-items: start !important;
            margin-top: 0 !important;
            padding: 0 !important;
          }

          .status-inner-card > div,
          .pr3nt-final-status > div {
            min-width: 0 !important;
            max-width: 100% !important;
          }

          .status-inner-card span,
          .pr3nt-final-status span {
            display: block !important;
            font-size: 19px !important;
            line-height: 1.18 !important;
            margin: 0 0 5px !important;
          }

          .status-inner-card small,
          .pr3nt-final-status small {
            display: block !important;
            font-size: 15px !important;
            line-height: 1.42 !important;
          }

          .mini-printer {
            width: 96px !important;
            height: 58px !important;
            flex: 0 0 auto !important;
          }

          .grid,
          .project-info-grid,
          .preview-messages-grid,
          .self-grid.pr3nt-managed-selfservice,
          .account-section,
          .form-grid {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            margin: 0 0 12px !important;
          }

          .card,
          .project-info-grid .card,
          .preview-messages-grid .card,
          .self-card,
          .price-card {
            border-radius: 20px !important;
            padding: 16px !important;
            min-height: 0 !important;
            box-shadow: 0 8px 22px rgba(16,24,32,.055) !important;
          }

          .card h2,
          .project-info-grid .card h2,
          .preview-messages-grid .card h2 {
            font-size: 22px !important;
            line-height: 1.12 !important;
            margin: 0 0 10px !important;
          }

          .project-info-grid table,
          .project-info-grid tbody,
          .project-info-grid tr,
          .project-info-grid td,
          .card table,
          .card tbody,
          .card tr,
          .card td {
            display: block !important;
            width: 100% !important;
          }

          .project-info-grid tr,
          .card tr {
            padding: 9px 0 !important;
            border-bottom: 1px solid #e5e7eb !important;
          }

          .project-info-grid td,
          .card td {
            padding: 0 !important;
            border: 0 !important;
            word-break: break-word !important;
          }

          .project-info-grid td:first-child,
          .card td:first-child {
            font-size: 11px !important;
            text-transform: uppercase !important;
            letter-spacing: .09em !important;
            color: #667085 !important;
            margin-bottom: 3px !important;
          }

          .printer-card {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            padding: 16px !important;
            border-radius: 20px !important;
            margin: 0 0 12px !important;
          }

          .printer {
            width: 120px !important;
            height: 78px !important;
          }

          .tracking-card {
            display: grid !important;
            grid-template-columns: 42px 1fr !important;
            gap: 12px !important;
            padding: 16px !important;
            border-radius: 20px !important;
          }

          .tracking-icon {
            width: 42px !important;
            height: 42px !important;
            border-radius: 14px !important;
            font-size: 22px !important;
          }

          .btn,
          button,
          .btn-light,
          .btn-primary,
          label.btn {
            width: 100% !important;
            min-height: 42px !important;
            padding: 10px 14px !important;
            font-size: 14px !important;
          }

          textarea,
          input,
          select {
            min-height: 44px !important;
            font-size: 15px !important;
          }

          canvas,
          model-viewer,
          .viewer,
          .model-viewer,
          #viewer {
            width: 100% !important;
            max-width: 100% !important;
            min-height: 240px !important;
            max-height: 320px !important;
            border-radius: 18px !important;
          }

          .pr3nt-file-carousel {
            display: flex !important;
            gap: 8px !important;
            overflow-x: auto !important;
            padding: 0 0 6px !important;
          }

          .pr3nt-file-tile {
            width: 66px !important;
            height: 66px !important;
            min-width: 66px !important;
            border-radius: 15px !important;
          }

          .modal-card {
            width: calc(100vw - 24px) !important;
            max-width: calc(100vw - 24px) !important;
            padding: 16px !important;
            border-radius: 20px !important;
          }
        }
      </style>`;

      const html = body.includes('id="pr3nt-mobile-portal-css"')
        ? body.replace(/<style id="pr3nt-mobile-portal-css">[\s\S]*?<\/style>/, css)
        : body.replace('</head>', `${css}</head>`);

      return originalSend(html);
    };

    next();
  });
}
