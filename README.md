# geopen.io

The open library of geographic information.

A catalogue of geographic datasets — points, lines and polygons — that are free to
preview and free to download, with the source of every record travelling with it.

## Why it exists

Texas governments publish an enormous amount of geographic data across roughly 444
separate websites, in whatever format and at whatever URL each agency chose. Much of
it is technically public and functionally unreachable: behind an undocumented
endpoint, in a folder with no index, or as prose where a table should be. This
collects it in one place, keeps a copy, and records where it came from.

## Design constraints

- **Server-rendered.** A crawler or a model fetching a dataset page must find the
  title, description, source and licence in the HTML. Client-rendered shells return
  nothing, which defeats the entire discovery strategy.
- **Read-only.** geopen publishes what the editor produces. It never writes.
- **Provenance in the file.** Downloads carry source, licence and retrieval date
  inside the payload — a GeoJSON on someone's disk should still explain itself a
  year later.
- **No account, no key, no rate limit.** A dataset you can look at but not take is
  a viewer, not a library.

## Stack

Nuxt 3 (SSR) · Supabase (read-only) · MapLibre GL · IBM Plex

## Local development

    cp .env.example .env      # fill in Supabase credentials
    npm install
    npm run dev               # http://localhost:3100

## Routes

    /                         catalogue + search
    /d/:slug                  dataset page — map, fields, provenance, download
    /api/datasets             listing / search
    /api/stats                catalogue counts
    /api/d/:slug              dataset metadata + preview features
    /api/d/:slug/download     ?format=geojson|csv|kml

## Licence

Data derived here is released CC0. Source materials keep their own terms, noted per
dataset. Application code MIT.
