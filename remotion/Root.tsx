import { Composition } from "remotion";
import { NumaLaunch } from "./NumaLaunch";

export function RemotionRoot() {
  return (
    <Composition
      id="NumaLaunch"
      component={NumaLaunch}
      durationInFrames={210}
      fps={30}
      width={1920}
      height={1080}
    />
  );
}
