# Spec Delta

## Purpose

Alerts the user, while the app is open, when a parking space becomes available on a camera they chose to be notified about.

## ADDED Requirements

### Requirement: Per-camera notification toggle
The user SHALL be able to enable or disable availability notifications for each watched camera; the preference SHALL persist in `localStorage` with the camera list. Notifications SHALL be off by default.

#### Scenario: Enable notifications
- **WHEN** the user turns on notifications for camera `47`
- **THEN** future availability events for camera `47` trigger alerts

### Requirement: Notify when space becomes available
The UI SHALL alert the user when a notification-enabled camera's available-space count rises from zero to one or more, or when a new available stretch appears in a zone that had none. Alerts SHALL name the camera and zone and SHALL NOT fire for unknown views, low-quality frames or failed analyses.

#### Scenario: Space opens
- **WHEN** camera `47` goes from 0 to 1 available space in zone "Right curb"
- **THEN** the user receives an alert "1 free space — Right curb (Home street)"

#### Scenario: Count unchanged
- **WHEN** consecutive updates keep reporting the same available stretches
- **THEN** no further alerts are sent

#### Scenario: Unknown view
- **WHEN** a camera switches to an unknown view
- **THEN** no availability alert is sent

### Requirement: In-app and browser notifications
Alerts SHALL appear as an animated in-app toast that links to the camera's focus view. If the user granted browser notification permission, the system SHALL also show a native browser notification when the page is not visible. Permission SHALL be requested only after an explicit user action.

#### Scenario: Tab in background with permission
- **WHEN** a space opens while the app tab is hidden and permission was granted
- **THEN** a native browser notification is shown, and clicking it focuses the tab on that camera

#### Scenario: Permission denied
- **WHEN** the user has denied browser notification permission
- **THEN** only in-app toasts are shown and the settings indicate how to re-enable browser notifications

### Requirement: Notification cooldown
The system SHALL suppress repeat alerts for the same camera within a configurable cooldown (default 2 minutes) unless the available count increases further.

#### Scenario: Flapping availability
- **WHEN** camera `47` goes 0 → 1 → 0 → 1 within one minute
- **THEN** only the first transition triggers an alert

### Requirement: Optional sound
The user SHALL be able to enable a short alert sound for in-app notifications; it SHALL be off by default.

#### Scenario: Sound enabled
- **WHEN** sound is enabled and a space opens
- **THEN** a short chime plays along with the toast
