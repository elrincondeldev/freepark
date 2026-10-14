# Spec Delta

## Purpose

Lets an anonymous user choose which public Vigo traffic cameras they want under surveillance and keeps that selection in their own browser between visits.

## ADDED Requirements

### Requirement: Add camera by URL or identifier
The system SHALL let the user add a camera by pasting a Vigo camera URL (`https://camaras.vigo.org/webcam/cam.php?id=<id>`) or by typing its identifier alone. Identifiers SHALL be normalised so that equivalent inputs (e.g. `4` and `04`) refer to the same camera as published by the source.

#### Scenario: Add camera from full URL
- **WHEN** the user submits `https://camaras.vigo.org/webcam/cam.php?id=47`
- **THEN** camera `47` is added to the watched list and appears on the dashboard

#### Scenario: Add camera from bare identifier
- **WHEN** the user submits `04`
- **THEN** camera `04` is added to the watched list

#### Scenario: Unrecognised input
- **WHEN** the user submits text that is neither a Vigo camera URL nor an identifier (e.g. `https://example.com/foo`)
- **THEN** the camera is not added and an inline error explains the accepted formats

### Requirement: Validate camera before adding
The system SHALL confirm that the camera source returns an image before adding it, and SHALL show the user a preview of that image as confirmation.

#### Scenario: Camera exists
- **WHEN** the user submits identifier `34` and the source returns a JPEG image
- **THEN** a preview thumbnail is shown and the camera is added

#### Scenario: Camera does not exist or is offline
- **WHEN** the user submits an identifier for which the source returns an error or a non-image response
- **THEN** the camera is not added and the user sees a message that the camera could not be reached

### Requirement: Prevent duplicate cameras
The system SHALL NOT allow the same camera to appear twice in the watched list.

#### Scenario: Adding an already watched camera
- **WHEN** the user adds camera `47` while `47` is already in the list
- **THEN** no duplicate is created and the existing camera card is highlighted

### Requirement: Persist watched cameras locally
The system SHALL store the watched camera list, each camera's optional display label and its notification preference in the browser's `localStorage`, and SHALL restore them on the next visit without any login.

#### Scenario: Reload restores cameras
- **WHEN** the user has added cameras `47` and `04` and reloads the page
- **THEN** both cameras are shown again in the same order with the same labels

#### Scenario: Storage unavailable
- **WHEN** `localStorage` is unavailable or throws (e.g. private mode with storage blocked)
- **THEN** the app still works for the current session and shows a non-blocking notice that the list will not be saved

### Requirement: Remove and rename cameras
The system SHALL let the user remove a camera from the watched list and set a custom display label for it.

#### Scenario: Remove camera
- **WHEN** the user removes camera `04`
- **THEN** it disappears from the dashboard, from `localStorage`, and the client stops subscribing to its updates

#### Scenario: Rename camera
- **WHEN** the user sets the label of camera `47` to "Home street"
- **THEN** the dashboard shows "Home street" for that camera and the label survives a reload
