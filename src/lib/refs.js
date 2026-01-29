// src/lib/refs.js
import { collection, doc } from "firebase/firestore";
import { db, TABLE_ID } from "./firebase";

export const tableRef = () => doc(db, "tables", TABLE_ID);


export const playersCol = () => collection(db, "tables", TABLE_ID, "players");
export const playerRef = (playerId) => doc(db, "tables", TABLE_ID, "players", playerId);

export const rollsCol = () => collection(db, "tables", TABLE_ID, "rolls");

export const npcsCol = () => collection(db, "tables", TABLE_ID, "npcs");
export const npcRef = (npcId) => doc(db, "tables", TABLE_ID, "npcs", npcId);

export const rollRef = (rollId) => doc(db, "tables", TABLE_ID, "rolls", rollId);
