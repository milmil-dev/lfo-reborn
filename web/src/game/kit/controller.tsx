import { Ui } from "./ui";

/*
  CONTROL SETTING panel (interface/controller, 724 × 499) as the client's HD art. The
  editable fields sit on its own field pills (see game/key-config.tsx), measured from the art:
  rows from y 209, 29.3 px apart, 22 px tall; keyboard pills x 217–317, gamepad pills x 506–606.
*/

export const PANEL = { w: 724, h: 499 };
export const ROW_Y = (i: number) => Math.round(209 + i * 29.3);
export const ROW_H = 22;
export const FIELD = { key: { x: 217, w: 100 }, pad: { x: 506, w: 100 } };

export function ControllerPanel() {
  return <Ui name="interface/controller" w={PANEL.w} h={PANEL.h} className="absolute inset-0" />;
}
