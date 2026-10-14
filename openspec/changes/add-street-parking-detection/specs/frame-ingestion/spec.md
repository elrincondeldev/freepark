# Spec Delta

## Purpose

Fetches camera images from the public Vigo source only when someone is watching, detects genuinely new images cheaply, and makes each new frame available for analysis and display.

## ADDED Requirements

### Requirement: Watch-driven monitoring
The backend SHALL monitor a camera only while at least one connected client is subscribed to it, and SHALL stop polling that camera within one poll interval after the last subscriber disconnects or unsubscribes.

#### Scenario: First subscriber starts monitoring
- **WHEN** a client subscribes to camera `47` and no other client is watching it
- **THEN** the backend starts polling camera `47`

#### Scenario: Shared monitoring
- **WHEN** two clients subscribe to camera `47`
- **THEN** the backend polls camera `47` once per interval, not once per client

#### Scenario: Last subscriber leaves
- **WHEN** the only client watching camera `47` closes its connection
- **THEN** the backend stops polling camera `47` and makes no further analysis requests for it

### Requirement: Detect image updates
The backend SHALL poll each monitored camera at a configurable interval (default 5 seconds) and SHALL treat an image as new only when the source reports a change. It SHALL use conditional requests based on the source's `Last-Modified` value and fall back to comparing image content when the source provides no such value.

#### Scenario: Image unchanged
- **WHEN** the backend polls camera `34` and the source answers `304 Not Modified`
- **THEN** no new frame is created and no analysis is triggered

#### Scenario: Image updated
- **WHEN** the source answers `200` with a `Last-Modified` later than the previous frame's
- **THEN** a new frame is created with that timestamp and queued for analysis

#### Scenario: No Last-Modified header
- **WHEN** the source answers `200` without `Last-Modified` and the image bytes are identical to the previous frame
- **THEN** no new frame is created

### Requirement: Single in-flight analysis per camera
The backend SHALL process at most one frame per camera at a time; if newer frames arrive while one is being analysed, only the most recent SHALL be analysed next and intermediate frames SHALL be skipped.

#### Scenario: Slow analysis
- **WHEN** two new frames of camera `47` arrive while the previous frame is still being analysed
- **THEN** only the newer of the two is analysed afterwards

### Requirement: Resilience to source failures
The backend SHALL tolerate source errors and timeouts without crashing, SHALL back off exponentially (capped) on repeated failures, and SHALL report the camera as offline to subscribers until a successful fetch.

#### Scenario: Source temporarily down
- **WHEN** fetching camera `04` fails three consecutive times
- **THEN** subscribers receive an "offline" status for camera `04` and polling continues with increasing delay

#### Scenario: Empty or non-image response
- **WHEN** the source answers `200` with an empty body or bytes that are not a JPEG image
- **THEN** the response is treated as a failed fetch, not as a new frame

#### Scenario: Source recovers
- **WHEN** a subsequent fetch for camera `04` succeeds
- **THEN** subscribers receive an "online" status and the new frame

### Requirement: Serve frames to clients
The backend SHALL serve each stored frame's image at a stable URL so the UI displays exactly the image that was analysed, and SHALL retain at least the most recent frames per camera (configurable, default 20) for zone drawing.

#### Scenario: Fetch latest analysed frame
- **WHEN** the UI requests the image of the frame referenced in an occupancy update
- **THEN** the backend returns that exact JPEG with cache headers allowing the browser to cache it

#### Scenario: Old frames pruned
- **WHEN** more than the retention limit of frames exist for a camera
- **THEN** the oldest frames are deleted, except frames referenced as a view's reference image
