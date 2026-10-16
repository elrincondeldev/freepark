# Spec Delta

## Purpose

Lets the user mark, roughly, where cars can park along the curbs visible in each camera view, without requiring exact parking bays.

## ADDED Requirements

### Requirement: Draw curb parking lines
The system SHALL let the user draw one or more parking zones on a view's reference image, each defined as a polyline running along the curb where vehicles park. Zones SHALL be stored in coordinates normalised to the image size.

#### Scenario: Draw a zone
- **WHEN** the user clicks points along the right-hand curb of view A and finishes the line
- **THEN** a zone with those points is saved for view A and immediately shown on the live overlay

#### Scenario: Too few points
- **WHEN** the user tries to finish a zone with fewer than two points
- **THEN** the zone is not saved and the editor indicates at least two points are required

### Requirement: Tolerance band around lines
Each zone SHALL have an adjustable tolerance band (width perpendicular to the line, scaled with perspective) so vehicles parked partly inside or partly outside the drawn line are still treated as parked on that zone. The editor SHALL display the band while editing.

#### Scenario: Car parked slightly outside the line
- **WHEN** a parked car's footprint lies outside the drawn line but touches the zone's tolerance band or sits right beside it
- **THEN** the car counts as occupying that zone

#### Scenario: Car in the traffic lane
- **WHEN** a vehicle's footprint is clearly beyond the tolerance band (e.g. driving in the lane)
- **THEN** it does not count as occupying the zone

#### Scenario: Band follows perspective regardless of drawing direction
- **WHEN** the user draws a zone starting from the end far from the camera
- **THEN** the wider "near" band width still applies at the end nearer the camera

### Requirement: Zone properties
Each zone SHALL have a name and an optional minimum gap length override; zones without an override SHALL use the default estimated car length.

#### Scenario: Name a zone
- **WHEN** the user names a zone "Right curb, near bakery"
- **THEN** that name appears in occupancy summaries and notifications for that zone

### Requirement: Edit and delete zones
The system SHALL let the user move, insert and delete points of an existing zone, change its band width and properties, and delete the zone. Changes SHALL apply to the next analysed frame.

#### Scenario: Adjust a zone
- **WHEN** the user drags a point of a zone and saves
- **THEN** the next analysed frame uses the updated geometry

#### Scenario: Delete a zone
- **WHEN** the user deletes a zone
- **THEN** it no longer appears in overlays or availability counts

### Requirement: Zones are shared across clients
Zones and views SHALL be stored by the backend per camera identifier, so every client watching that camera uses the same zones. No authentication SHALL be required to create or edit them.

#### Scenario: Second browser sees zones
- **WHEN** zones were drawn for camera `47` in one browser and a different browser adds camera `47`
- **THEN** the second browser shows the same zones and availability without redrawing

#### Scenario: Zones survive restart
- **WHEN** the backend container restarts
- **THEN** all views and zones are still present
