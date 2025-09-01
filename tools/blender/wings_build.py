# tools/blender/wings_build.py
# Fits, attaches, animates wings for each VRM and lets you manually control
# size (scale) + location (offset), then lock them.
#
# Usage examples (from RepoRoot):
#   blender -b -P tools/blender/wings_build.py -- --map wings_map.json
#   blender -b -P tools/blender/wings_build.py -- --map wings_map.json --scale-mult 1.05 --offset-add 0,0,-0.01
#   blender -b -P tools/blender/wings_build.py -- --map wings_map.json --only WhiteStar,Reyczar --lock-writeback 1
#
# How locking works:
# - Edit wings_map.json → per character set:
#     "transform": { "locked": false, "scale": 1.0, "offset": [0,0,-0.03], "rotation_deg":[0,0,0] }
# - Run the script; adjust values in JSON or via CLI until it looks right.
# - Set "locked": true (or run with --lock-writeback 1) to freeze those values
#   so future runs skip auto-sizing and use your exact numbers.

import bpy, sys, os, json
from math import radians
from mathutils import Vector

# ---------------------- CLI / args ----------------------
def parse_vec3(s):
    # "x,y,z" -> [float, float, float]
    try:
        x, y, z = [float(v.strip()) for v in s.split(",")]
        return [x, y, z]
    except Exception:
        raise ValueError(f"Bad vec3: {s} (expected like 0,0,-0.03)")

argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--")+1:]
else:
    argv = []

# defaults
MAP_PATH         = "wings_map.json"
ONLY_NAMES       = None         # list[str] or None
GLOBAL_SCALEMULT = 1.0          # multiply final scale
GLOBAL_OFFSETADD = [0.0, 0.0, 0.0]  # add to final offset
LOCK_WRITEBACK   = False        # if True, persist used scale/offset & set locked:true

i = 0
while i < len(argv):
    k = argv[i]
    if k == "--map":
        MAP_PATH = argv[i+1]; i += 2
    elif k == "--only":
        ONLY_NAMES = [p.strip() for p in argv[i+1].split(",") if p.strip()]; i += 2
    elif k == "--scale-mult":
        GLOBAL_SCALEMULT = float(argv[i+1]); i += 2
    elif k == "--offset-add":
        GLOBAL_OFFSETADD = parse_vec3(argv[i+1]); i += 2
    elif k == "--lock-writeback":
        LOCK_WRITEBACK = argv[i+1] not in ("0","false","False","no","No"); i += 2
    else:
        print(f"[WARN] Unknown arg {k}; skipping")
        i += 1

# ---------------------- helpers ----------------------
def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def ensure_folder(path):
    os.makedirs(path, exist_ok=True)

def import_character(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".vrm":
        try:
            bpy.ops.import_scene.vrm(filepath=path)
        except Exception as e:
            raise RuntimeError("VRM import failed. Enable the VRM add-on in Blender Preferences.") from e
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise RuntimeError(f"Unsupported character format: {ext}")
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not arms:
        raise RuntimeError("No armature found after importing character.")
    return arms[0]

def import_wings(path):
    ext = os.path.splitext(path)[1].lower()
    def do_import(p):
        e = os.path.splitext(p)[1].lower()
        if e == ".fbx":
            bpy.ops.import_scene.fbx(filepath=p)
        elif e in (".glb",".gltf"):
            bpy.ops.import_scene.gltf(filepath=p)
        elif e == ".obj":
            bpy.ops.wm.obj_import(filepath=p)
        else:
            raise RuntimeError(f"Unsupported wings format: {e}")
    do_import(path)
    # Return objects imported in this op (selected), fallback to meshes having "wing" in name
    sel = [o for o in bpy.context.selected_objects if o.type in {"MESH","EMPTY"}]
    if sel:
        return sel
    return [o for o in bpy.data.objects if o.type=="MESH" and "wing" in o.name.lower()]

def find_bone(arm, candidates):
    names = {b.name for b in arm.data.bones}
    for c in candidates:
        if c in names: return c
    # fuzzy
    for c in candidates:
        for b in arm.data.bones:
            if c.lower() in b.name.lower():
                return b.name
    return None

def bone_center_world(arm, bone_name):
    b = arm.data.bones[bone_name]
    h = arm.matrix_world @ b.head_local
    t = arm.matrix_world @ b.tail_local
    return (h + t) * 0.5

def shoulders_width(arm):
    L = find_bone(arm, ["shoulder.L","LeftShoulder","shoulder_L"])
    R = find_bone(arm, ["shoulder.R","RightShoulder","shoulder_R"])
    if not (L and R): return 0.35
    Lv = arm.matrix_world @ arm.data.bones[L].head_local
    Rv = arm.matrix_world @ arm.data.bones[R].head_local
    return (Lv - Rv).length

def parent_to_bone(obj, arm, bone_name):
    bpy.context.view_layer.objects.active = arm
    obj.select_set(True)
    arm.select_set(True)
    bpy.ops.object.parent_set(type='BONE', keep_transform=True)
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name

def add_flap(objects, degrees=25, period=48, fps=24):
    sc = bpy.context.scene
    sc.render.fps = fps
    keys = [(1,0),(period//4,degrees),(period//2,0),(3*period//4,-degrees),(period,0)]
    for o in objects:
        o.rotation_mode = 'XYZ'
        o.keyframe_insert(data_path="rotation_euler", frame=1)
        for f,deg in keys:
            o.rotation_euler[2] = radians(deg)
            o.keyframe_insert(data_path="rotation_euler", frame=f)
        if o.animation_data and o.animation_data.action:
            for fcu in o.animation_data.action.fcurves:
                fcu.modifiers.new('CYCLES')

def add_breath(arm, bone_name, degrees=2, period=96, fps=24):
    if not bone_name: return
    sc = bpy.context.scene
    sc.render.fps = fps
    bpy.ops.object.mode_set(mode='POSE')
    p = arm.pose.bones.get(bone_name)
    if not p:
        bpy.ops.object.mode_set(mode='OBJECT'); return
    keys = [(1,0),(period//4,degrees),(period//2,0),(3*period//4,-degrees),(period,0)]
    p.rotation_mode = 'XYZ'
    for f,deg in keys:
        p.rotation_euler[0] = radians(deg)
        p.keyframe_insert(data_path="rotation_euler", frame=f)
    if arm.animation_data and arm.animation_data.action:
        for fcu in arm.animation_data.action.fcurves:
            fcu.modifiers.new('CYCLES')
    bpy.ops.object.mode_set(mode='OBJECT')

def export_glb(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True)

def export_vrm(path):
    bpy.ops.export_scene.vrm(filepath=path)

# ---------------------- main ----------------------
with open(MAP_PATH, "r", encoding="utf-8") as f:
    cfg = json.load(f)

exp_cfg   = cfg.get("export", {})
OUT_DIR   = exp_cfg.get("folder", "build/out")
FPS       = int(exp_cfg.get("fps", 24))
FLAP_DEG  = float(exp_cfg.get("flap_degrees", 25))
FLAP_PER  = int(exp_cfg.get("flap_period_frames", 48))
BREATH_DEG= float(exp_cfg.get("breath_degrees", 2))
FMT       = exp_cfg.get("format", "glb").lower()

ensure_folder(OUT_DIR)

# For optional write-back
used_transforms = {}  # name -> {"scale": s, "offset":[x,y,z], "rotation_deg":[rx,ry,rz], "locked": True}

def process_char(item):
    name = item["name"]
    if ONLY_NAMES and name not in ONLY_NAMES:
        print(f"[SKIP] {name} (not in --only)")
        return

    clean_scene()
    print(f"[BUILD] {name}")
    arm = import_character(item["vrm"])

    # attach bone (prefer chest family)
    attach_bone = item.get("attach_bone")
    if not attach_bone:
        for trial in ["chest","upper_chest","spine2","spine.002","spine","spine1","spine.001"]:
            attach_bone = find_bone(arm, [trial])
            if attach_bone: break
    if not attach_bone:
        raise RuntimeError("No attachable chest/spine bone found")

    wings_cfg = item["wings"]
    wings_objs_before = set(bpy.data.objects)
    imported = import_wings(wings_cfg["file"])
    wings_objs = [o for o in bpy.data.objects if o not in wings_objs_before and o.type in {"MESH","EMPTY"}]
    if not wings_objs:
        wings_objs = [o for o in imported if o.type=="MESH"]
    if not wings_objs:
        raise RuntimeError("Could not detect wing meshes")

    # Base transform from JSON
    tr = item.get("transform", {})
    locked      = bool(tr.get("locked", False))
    scale_user  = float(tr.get("scale", 1.0))          # your manual scale
    offset_user = list(tr.get("offset", [0.0, 0.0, -0.03]))  # your manual offset
    rot_deg     = list(tr.get("rotation_deg", [0.0, 0.0, 0.0]))

    # If not locked: auto-size by shoulder width, then apply your manual scale multiplier
    if not locked:
        sw = shoulders_width(arm)
        # estimate current wings span in X
        minx, maxx =  1e9, -1e9
        for o in wings_objs:
            # evaluate bounding box in world space
            for v in o.bound_box:
                w = o.matrix_world @ Vector(v)
                minx, maxx = min(minx, w.x), max(maxx, w.x)
        span = max(0.001, maxx - minx)
        target_mul = float(wings_cfg.get("target_span_multiplier", 1.3))
        scale_auto = (sw * target_mul) / span
        # combine: wings scale_hint * auto * your manual * global
        scale_final = float(wings_cfg.get("scale_hint", 1.0)) * scale_auto * scale_user * GLOBAL_SCALEMULT
    else:
        # locked: trust your manual + global only
        scale_final = scale_user * GLOBAL_SCALEMULT

    # Final offset = your manual + global add
    offset_final = [
        offset_user[0] + GLOBAL_OFFSETADD[0],
        offset_user[1] + GLOBAL_OFFSETADD[1],
        offset_user[2] + GLOBAL_OFFSETADD[2],
    ]

    # Apply transforms
    chest_ctr = bone_center_world(arm, attach_bone)
    rx, ry, rz = [radians(v) for v in rot_deg]
    for o in wings_objs:
        o.location = (chest_ctr.x + offset_final[0],
                      chest_ctr.y + offset_final[1],
                      chest_ctr.z + offset_final[2])
        o.rotation_mode = 'XYZ'
        o.rotation_euler = (rx, ry, rz)
        o.scale = (o.scale[0]*scale_final, o.scale[1]*scale_final, o.scale[2]*scale_final)
        parent_to_bone(o, arm, attach_bone)

    # Animate
    add_flap(wings_objs, degrees=FLAP_DEG, period=FLAP_PER, fps=FPS)
    chest_bone = find_bone(arm, ["chest","upper_chest","spine2","spine.002"])
    add_breath(arm, chest_bone or attach_bone, degrees=BREATH_DEG, period=FLAP_PER*2, fps=FPS)

    # Export
    out_name = f"{name.lower()}_wings.{FMT}"
    out_path = os.path.join(OUT_DIR, out_name)
    if FMT == "vrm":
        export_vrm(out_path)
    else:
        export_glb(out_path)
    print(f"[OK] Exported {out_path}")

    # record what we used, optionally to write back
    used_transforms[name] = {
        "scale": scale_user if locked else round(scale_final / max(GLOBAL_SCALEMULT, 1e-9), 6),
        "offset": [round(v, 6) for v in offset_final],
        "rotation_deg": [round(v, 6) for v in rot_deg],
        "locked": True if LOCK_WRITEBACK else locked
    }

# process all characters
for item in cfg.get("characters", []):
    process_char(item)

# Optional: write back final transforms & lock to the JSON,
# so next run uses your chosen values without autosize.
if LOCK_WRITEBACK:
    changed = False
    for c in cfg.get("characters", []):
        nm = c["name"]
        if nm in used_transforms:
            tr_used = used_transforms[nm]
            c.setdefault("transform", {})
            c["transform"]["scale"] = tr_used["scale"]
            c["transform"]["offset"] = tr_used["offset"]
            c["transform"]["rotation_deg"] = tr_used["rotation_deg"]
            c["transform"]["locked"] = True
            changed = True
    if changed:
        with open(MAP_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        print(f"[WRITEBACK] Updated {MAP_PATH} with locked transforms.")
