import abyss from "./abyss";
import corridor from "./corridor";
import crossroads from "./crossroads";
import drop from "./drop";
import falseExit from "./falseExit";
import gravity from "./gravity";
import junction from "./junction";
import prologue from "./prologue";
import room from "./room";
import stairs from "./stairs";
import walkway from "./walkway";

/** Chunk registry: type → { build(builder, opts) → Chunk }. */
const CHUNKS = { prologue, walkway, corridor, junction, stairs, room, gravity, abyss, crossroads, falseExit, drop };
export default CHUNKS;
