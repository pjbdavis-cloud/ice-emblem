import { useEffect, useMemo, useState } from "react";
import type { UnitSpriteDefinition } from "./types";

export function useSpriteImages(definitions: Array<UnitSpriteDefinition | undefined>) {
  const uniqueDefinitions = useMemo(
    () =>
      Array.from(
        new Map(
          definitions
            .filter((definition): definition is UnitSpriteDefinition => Boolean(definition?.src))
            .map((definition) => [definition.src, definition]),
        ).values(),
      ),
    [definitions],
  );
  const [imageMap, setImageMap] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    let isMounted = true;

    const pendingDefinitions = uniqueDefinitions.filter((definition) => !imageMap[definition.src]);
    if (pendingDefinitions.length === 0) {
      return;
    }

    pendingDefinitions.forEach((definition) => {
      const image = new Image();
      image.onload = () => {
        if (!isMounted) {
          return;
        }

        setImageMap((current) => ({ ...current, [definition.src]: image }));
      };
      image.onerror = () => {
        if (!isMounted) {
          return;
        }

        setImageMap((current) => ({ ...current, [definition.src]: image }));
      };
      image.src = definition.src;
    });

    return () => {
      isMounted = false;
    };
  }, [imageMap, uniqueDefinitions]);

  return imageMap;
}
