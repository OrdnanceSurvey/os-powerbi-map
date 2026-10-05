# Changelog
All notable changes to the visual will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [1.0.3.0] - 2026/10/05

### Fixed 
- Internal changes to restructure batching of geocode queries, in order to work around a bug / behaviour change introduced in ArcGIS Online (ESRI BUG-000187369), which causes geocoding to fail in the visual when more than 4000 unique values were being added. [harry-gibson]

## [1.0.2.0] - 2026/09/29
- Fixes to autozoom behaviour on visual reload, was zooming to full extent each time in some situations [harry-gibson]
- Upgrade autozoom control to give three options for data-following behaviour rather than (unsuccessfully) trying to guess correct behaviour [harry-gibson]
- Fix bug whereby OSGB maps would, if full data extent gave a zoom level -between -2 and 0, actually zoom right out to -2 [harry-gibson]
- Updates to service URLs [harry-gibson]

## [1.0.1.0] - 2026/05/15

### Changed
- More updates to service URLs [harry-gibson]
- Fix github URL for retrieval of service URLs at runtime [harry-gibson]
- Fixes to logging [harry-gibson]

## [1.0.0.1] - 2026/05/01

### Changed
- Fixes to service URLs, various UI tweaks. Bump version and set repo to public.

## [1.0.0.0] - 2026/04/30

### Added
- Add code to open source GitHub repo. [MMarochov] [harry-gibson]

