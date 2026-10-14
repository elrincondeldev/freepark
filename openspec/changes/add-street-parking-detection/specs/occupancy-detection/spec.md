# Spec Delta

## Purpose

Turns each new camera frame into a list of detected vehicles and, for a recognised view, into occupied and available stretches of each parking zone.

## ADDED Requirements

### Requirement: Detect vehicles with a hosted AI model
For each new frame selected for analysis, the backend SHALL request vehicle detection from a model hosted on Replicate and SHALL obtain bounding boxes with a class and confidence for cars, vans, trucks and motorcycles. The model and its parameters SHALL be configurable without code changes.

#### Scenario: Vehicles detected
- **WHEN** a frame of camera `47` containing parked cars is analysed
- **THEN** the result contains one bounding box per detected vehicle with class and confidence, in coordinates normalised to the image

#### Scenario: Low-confidence detections
- **WHEN** the model returns detections below the configured confidence threshold
- **THEN** those detections are discarded

### Requirement: Never analyse unchanged images
The backend SHALL send a frame to the model only when it is a new image of a watched camera and its quality check passed; it SHALL NOT send repeated or unchanged images.

#### Scenario: Unchanged image
- **WHEN** a poll reports no change
- **THEN** no Replicate prediction is created

### Requirement: Handle model failures
When a prediction fails, times out or the API token is missing, the backend SHALL report an "analysis unavailable" status for that frame, SHALL keep serving the image, and SHALL retry on the next new frame.

#### Scenario: Missing API token
- **WHEN** no Replicate API token is configured
- **THEN** the UI still shows live camera images with a visible "analysis disabled" status and no availability is reported

#### Scenario: Rate limited
- **WHEN** Replicate responds with a rate-limit error
- **THEN** the frame is reported as "analysis unavailable" and the backend respects the retry delay before the next prediction

### Requirement: Assign vehicles to zones
For a frame matched to a view, the backend SHALL assign a detected vehicle to a zone when the vehicle's ground-contact point lies within that zone's tolerance band, and SHALL project it onto the zone line as an occupied interval.

#### Scenario: Partially overlapping car
- **WHEN** a car's bounding box straddles the drawn curb line
- **THEN** the car is assigned to that zone and its interval along the line is marked occupied

#### Scenario: Moving traffic ignored
- **WHEN** a vehicle is detected in the middle of the carriageway far from any zone band
- **THEN** it is shown as a detection but not counted as occupying any zone

### Requirement: Compute available gaps
For each zone the backend SHALL compute the free stretches between occupied intervals (and between intervals and zone ends) and SHALL report a stretch as an available space only when its length is at least the zone's minimum gap length, estimated in a perspective-aware way from the size of vehicles detected near that point (or the zone override). Each available stretch SHALL report how many cars fit in it.

#### Scenario: Gap large enough
- **WHEN** a zone has a free stretch roughly 1.3 car-lengths long at that position
- **THEN** one available space is reported for that stretch

#### Scenario: Gap too small
- **WHEN** a free stretch is shorter than one estimated car length
- **THEN** it is not reported as available

#### Scenario: Empty zone
- **WHEN** a zone contains no vehicles
- **THEN** the whole zone is reported available with an estimated count of spaces

### Requirement: Occupancy result
Each analysed frame SHALL produce a result containing camera identifier, frame identifier and timestamp, view status (matched view, unknown, low quality, analysis unavailable), detected vehicles, per-zone occupied segments, per-zone available segments with estimated space counts, and the camera-wide total of available spaces.

#### Scenario: Result for unknown view
- **WHEN** a frame is marked as an unknown view
- **THEN** the result includes detected vehicles but no zone segments and a total of available spaces equal to null (not zero)

### Requirement: Smooth flickering results
The backend SHALL stabilise availability across consecutive frames of the same view so that a single missed detection does not flip a space to available; a stretch SHALL become available only after it is free in a configurable number of consecutive analysed frames (default 2).

#### Scenario: One-frame missed detection
- **WHEN** a parked car is missed in one frame but detected in the frames before and after
- **THEN** its stretch is never reported available
