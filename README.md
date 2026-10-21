# Webill Green website

The public website for Webill Green, the traded electricity platform for South Africa.

Plain HTML, CSS and JavaScript with no build step. Pages sit at the root; styles, scripts and images are in `assets/`.

## Preview locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Publishing

GitHub Pages serves the `main` branch root. Every push to `main` updates the live site within a minute or two.

## Before you edit

- The walkthrough request form is a HubSpot form (portal 149531349, EU data centre). Its IDs are in `HUBSPOT_FORM` at the top of `assets/site.js`; edit the fields, consent text and notifications in HubSpot.
- The header and footer are repeated in every page. Change all eight when the navigation changes.
