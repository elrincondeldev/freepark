# Spec Delta

## Purpose

Shows the user's watched cameras in real time with clear, animated red/green parking overlays in a minimalist, fast and intuitive interface.

## ADDED Requirements

### Requirement: Real-time updates
The UI SHALL receive frame and occupancy updates pushed by the backend over a persistent connection, subscribing to exactly the cameras in the user's watched list, and SHALL show a new image within 2 seconds of the backend ingesting it.

#### Scenario: New frame arrives
- **WHEN** the backend ingests a new frame of a watched camera
- **THEN** the camera card swaps to the new image without a page reload

#### Scenario: Connection drops
- **WHEN** the connection to the backend is lost
- **THEN** the UI shows a discreet "reconnecting" indicator, retries with backoff, and re-subscribes to all watched cameras once reconnected

### Requirement: Occupied and available overlays
Over each image the UI SHALL draw red rectangles around vehicles occupying a parking zone and green rectangles (shaped to the curb's perspective) over available stretches, aligned with the image at any display size. Overlays SHALL always correspond to the frame being displayed.

#### Scenario: Mixed occupancy
- **WHEN** an update reports two occupied vehicles and one available stretch on camera `47`
- **THEN** two red rectangles and one green rectangle are drawn in the correct positions

#### Scenario: Responsive scaling
- **WHEN** the card is resized (e.g. on a phone)
- **THEN** overlays scale with the image and stay aligned

#### Scenario: Image and analysis out of sync
- **WHEN** a new image is displayed but its analysis has not arrived yet
- **THEN** the previous frame's overlays are hidden or faded and a subtle "analysing" indicator is shown until the new results arrive

### Requirement: Camera status at a glance
Each camera card SHALL show its label, the count of available spaces, the time since the last image, and a status badge for: live, analysing, unknown view, low quality, analysis disabled/unavailable, and offline.

#### Scenario: Unknown view
- **WHEN** a camera reports an unknown view
- **THEN** the card shows an "unknown view" badge and a call to action to save the view and draw zones

#### Scenario: Stale image
- **WHEN** no new image has arrived for longer than 3 times the camera's usual update interval
- **THEN** the card indicates the image is stale

### Requirement: Animated, minimalist presentation
The UI SHALL animate overlay appearance and transitions (fade/scale for new rectangles, smooth crossfade between frames, animated count changes, layout animation when cameras are added, removed or reordered) and SHALL respect the user's reduced-motion preference by disabling non-essential motion.

#### Scenario: Space becomes available
- **WHEN** a stretch changes from occupied to available
- **THEN** the green rectangle appears with an entrance animation and the available-space counter animates to the new value

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** overlays and counters update without movement animations

### Requirement: Focus view
The user SHALL be able to open a camera in an enlarged focus view showing the image with overlays, a per-zone breakdown of available spaces, and access to the view and zone editors.

#### Scenario: Open focus view
- **WHEN** the user clicks a camera card
- **THEN** the card expands into a focus view with a shared-element animation and the zone breakdown is listed

### Requirement: Usable on mobile and desktop
The dashboard SHALL be usable on phone-sized screens (from 360 px wide) and desktop, in both light and dark color schemes, with keyboard-accessible controls.

#### Scenario: Phone layout
- **WHEN** the dashboard is opened on a 375 px wide screen
- **THEN** cameras are shown in a single column without horizontal scrolling

### Requirement: Empty state
When the user has no watched cameras the UI SHALL show an inviting empty state explaining how to add a camera, with the add-camera input focused.

#### Scenario: First visit
- **WHEN** a user opens the app for the first time
- **THEN** the empty state with the add-camera input is shown
