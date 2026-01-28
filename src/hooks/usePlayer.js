import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { playerRef } from "../lib/refs";

export function usePlayer(playerId) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;

    return onSnapshot(playerRef(playerId), (snap) => {
      setPlayer(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [playerId]);

  return { player, loading };
}
