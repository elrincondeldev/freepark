import { parseCameraInput } from './cameraInput'

test.each([
  ['4', '04'],
  ['04', '04'],
  ['47', '47'],
  ['https://camaras.vigo.org/webcam/cam.php?id=47', '47'],
  ['camaras.vigo.org/webcam/cam.php?id=4', '04'],
])('accepts %s', (input, id) => expect(parseCameraInput(input)).toBe(id))

test.each([
  '',
  'abc',
  '1234',
  'https://example.com/foo',
  'https://camaras.vigo.org/webcam/cam.php',
])('rejects %s', (input) => expect(parseCameraInput(input)).toBeNull())
