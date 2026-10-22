# Earth asset attribution

The Earth V1 textures in `public/earth/v1/` and the landmark sample in `assets/data/processed/earth-landmarks.json` derive from the datasets below. Full provenance (URLs, checksums, processing, licences) is in [MANIFEST.json](MANIFEST.json); the processing is reproducible with `pipeline/earth/earth_pipeline.py`. The game shows a short credit line in the footer.

## Required / requested credits

- **NASA Blue Marble: Next Generation** (July 2004, 21600×10800). Reto Stöckli, NASA Earth Observatory / NASA Goddard Space Flight Center. https://visibleearth.nasa.gov/images/74092
- **NASA Blue Marble clouds** (cloud_combined_8192). NASA Goddard Space Flight Center, Reto Stöckli; MODIS data. https://visibleearth.nasa.gov/images/57747
- **NASA Black Marble 2016** (night lights, 3 km grayscale). NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA Goddard Space Flight Center. https://earthobservatory.nasa.gov/features/NightLights
- **ETOPO 2022 Global Relief Model** (60 arc-second surface elevation). NOAA National Centers for Environmental Information, 2022. https://doi.org/10.25921/fd45-gt74
- **Natural Earth** (1:10m land, lakes, admin-0 countries). Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.
- **GeoNames** (cities15000). Contains data from GeoNames (https://www.geonames.org/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: a subset of 18 city records (name, country, coordinates) was extracted.

## Licence summary

| Source | Licence | Redistribution / derivatives |
| --- | --- | --- |
| NASA imagery (Blue Marble NG, clouds, Black Marble) | Not copyrighted in the US (NASA media guidelines). Credit requested; must not imply NASA endorsement; no NASA insignia | Permitted |
| NOAA ETOPO 2022 | US Government work, public domain. Citation requested | Permitted |
| Natural Earth | Public domain | Permitted |
| GeoNames | CC BY 4.0. Attribution required; indicate changes | Permitted with attribution |

NASA's guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/. Natural Earth terms: https://www.naturalearthdata.com/about/terms-of-use/.

These are Claude's readings of the published terms as of 2026-10-22. The owner should confirm them before a public release, especially for any non-US distribution of NASA imagery, where NASA notes that foreign copyright may apply.

## Not used

No Google Maps/Earth, commercial, watermarked or unattributed imagery. No procedurally invented geography: clouds and night lights are real NASA products. Procedural work is limited to shading (glint, atmosphere scattering, terminator).
