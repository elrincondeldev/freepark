# Spec Delta

## Purpose

Handles cameras that rotate or zoom between viewpoints by recognising which stored view each frame shows, so parking zones are only applied to the scene they were drawn for.

## ADDED Requirements

### Requirement: Match each frame to a stored view
For every new frame the backend SHALL decide whether it shows one of the camera's stored views, ignoring the burned-in timestamp banner and normal lighting, weather and traffic changes. A match SHALL include a confidence score.

#### Scenario: Same viewpoint, different traffic
- **WHEN** a new frame of camera `47` shows the same street as stored view A but with different cars and lighting
- **THEN** the frame is matched to view A with confidence above the match threshold

#### Scenario: Timestamp banner only differs
- **WHEN** two frames differ only in the timestamp text overlay
- **THEN** both are matched to the same view

### Requirement: Compensate small viewpoint drift
When a frame matches a view but the camera has shifted slightly (pan/tilt/zoom within the matcher's tolerance), the backend SHALL transform that view's zones into the frame's coordinates before computing occupancy.

#### Scenario: Slight pan
- **WHEN** camera `47` returns to view A shifted a few pixels to the left
- **THEN** the zones are aligned to the shifted image and overlays line up with the curb

### Requirement: Detect viewpoint changes
When a frame does not match any stored view with sufficient confidence, the backend SHALL mark it as an unknown view, SHALL NOT report parking availability for it, and SHALL notify subscribers that the viewpoint changed.

#### Scenario: Camera rotates to a new direction
- **WHEN** camera `04` turns to point down a different street
- **THEN** subscribers receive a "view changed — unknown view" status, the UI shows vehicles detected but no availability, and no availability notification is sent

#### Scenario: Camera returns to known view
- **WHEN** camera `04` later returns to stored view A
- **THEN** occupancy for view A resumes automatically without user action

### Requirement: Register new views
The system SHALL let the user save the current unknown-view frame as a new view of that camera, and SHALL use that frame as the view's reference for future matching. A camera with no stored views SHALL treat its first frame as unknown.

#### Scenario: Save a new view
- **WHEN** the user chooses "Save this view" while camera `04` shows an unknown view
- **THEN** a new view is created with that frame as reference, and the user is taken to the zone editor for it

#### Scenario: Multiple views per camera
- **WHEN** camera `47` has views A and B stored and alternates between them
- **THEN** each frame is matched to the correct view and uses that view's zones

### Requirement: Discard transitional frames
The backend SHALL skip occupancy for frames that are too blurred or too dark to analyse reliably (e.g. captured mid-rotation), reporting them as low-quality instead.

#### Scenario: Motion-blurred frame
- **WHEN** a frame is captured while the camera is moving and its sharpness is below the configured threshold
- **THEN** the frame is shown with a "low quality" status and no occupancy is reported for it

### Requirement: Manage stored views
The system SHALL let the user list, rename, re-capture the reference image of, and delete the views of a camera. Deleting a view SHALL delete its zones.

#### Scenario: Delete view
- **WHEN** the user deletes view B of camera `47`
- **THEN** view B and its zones are removed and frames that matched B are treated as unknown
