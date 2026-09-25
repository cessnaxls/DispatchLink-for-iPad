# DispatchLink iPad v1.3

Global-only iPad/Render port of the desktop DispatchLink OpenSky generator.

## Generator parity
The server requests OpenSky `/states/all`, shuffles ICAO24 hexes, checks up to 600 against HexDB, applies registration-prefix / manufacturer / model filters, then queries OpenSky flight history for the selected aircraft's latest arrival.

Authentication order matches the desktop design: OpenSky OAuth2 client credentials if configured, legacy Basic Auth if configured, otherwise anonymous OpenSky.

Optional Render environment variables:
- `OPENSKY_CLIENT_ID`
- `OPENSKY_CLIENT_SECRET`
- `OPENSKY_USERNAME`
- `OPENSKY_PASSWORD`

No FAA generator is included. No database is required.
