import bpy, sys, os, json, math
from math import radians

# ---------- CLI args ----------
# Usage:
#   blender -b -P tools/blender/wings_build.py -- --map wings_map.json
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--")+1:]
else:
    argv = []
args = {"--map": "wings_map.json"}
for i in range(0, len(argv), 2):
    args[argv[i]] = argv[i+1]
MAP_PATH = args.get("--map", "wings_map.json")

# ---------- Utilities ----------
def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def ensure_folder(path):
    os.makedirs(path, exist_ok=True)

def import_vrm(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".vrm":
        bpy.ops.import_scene.vrm(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise RuntimeError(f"Unsupported character format: {ext}")
    # Return main armature
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("No armature found after import")
    return armatures[0]

def import_wings(path, preferred="fbx"):
    ext = os.path.splitext(path)[1].lower()
    def do_import(p):
        e = os.path.splitext(p)[1].lower()
        if e == ".fbx":
            bpy.ops.import_scene.fbx(filepath=p)
        elif e in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=p)
        elif e == ".obj":
            bpy.ops.wm.obj_import(filepath=p)
        else:
            raise RuntimeError(f"Unsupported wings format: {e}")

    try:
        do_import(path)
    except Exception as e:
        # try alternate typical names if just a folder was given
        base = os.path.splitext(path)[0]
        tried = False
        for alt in (base+".glb", base+".gltf", base+".obj"):
            if os.path.exists(alt):
                do_import(alt); tried = True; break
        if not tried:
            raise
    # Collect newly added objects as wings group
    wings = [o for o in bpy.context.selected_objects] or [o for o in bpy.data.objects if "wing" in o.name.lower()]
    if not wings:
        # fallback: last imported meshes
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        wings = meshes[-5:]
    return wings

def armature_bone_names(arm):
    # Try common humanoid names
    names = [b.name for b in arm.data.bones]
    def first_match(candidates):
        for c in candidates:
            if c in names: return c
        # loose search
        for c in candidates:
            for n in names:
                if c.lower() in n.lower(): return n
        return None
    return {
        "chest": first_match(["chest","upper_chest","spine2","spine.002"]),
        "spine": first_match(["spine","spine1","spine.001"]),
        "shoulder.L": first_match(["shoulder.L","LeftShoulder","shoulder_L","upper_arm_parent.L"]),
        "shoulder.R": first_match(["shoulder.R","RightShoulder","shoulder_R","upper_arm_parent.R"]),
    }

def estimate_shoulder_width(arm, bones):
    # Distance between shoulders as sizing reference
    if bones["shoulder.L"] and bones["shoulder.R"]:
        L = arm.matrix_world @ arm.data.bones[bones["shoulder.L"]].head_local
        R = arm.matrix_world @ arm.data.bones[bones["shoulder.R"]].head_local
        return (L - R).length
    # fallback: chest width guess
    return 0.35

def center_of_bone_world(arm, bone_name):
    b = arm.data.bones[bone_name]
    h = arm.matrix_world @ b.head_local
    t = arm.matrix_world @ b.tail_local
    return (h + t) * 0.5

def parent_to_bone(obj, arm, bone_name):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    # keep transform
    bpy.ops.object.parent_set(type='BONE', keep_transform=True)
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name

def ensure_collection(name):
    coll = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    return coll

def add_flap_animation(objects, degrees=25, period=48, fps=24):
    # Simple symmetric flap by rotating Z
    scene = bpy.context.scene
    scene.render.fps = fps
    key = [
        (1, 0),
        (period//4,  degrees),
        (period//2,  0),
        (3*period//4, -degrees),
        (period,      0),
    ]
    for o in objects:
        bpy.context.view_layer.objects.active = o
        o.rotation_mode = 'XYZ'
        o.keyframe_insert(data_path="rotation_euler", frame=1)
        for f, deg in key:
            o.rotation_euler[2] = radians(deg)
            o.keyframe_insert(data_path="rotation_euler", frame=f)
        # make the curve cyclic
        for fcu in o.animation_data.action.fcurves:
            fcu.modifiers.new('CYCLES')

def add_chest_breath(arm, bone_name="chest", degrees=2, period=96, fps=24):
    if not bone_name: return
    scene = bpy.context.scene
    scene.render.fps = fps
    bpy.ops.object.mode_set(mode='POSE')
    pbone = arm.pose.bones.get(bone_name)
    if not pbone:
        bpy.ops.object.mode_set(mode='OBJECT')
        return
    key = [
        (1, 0),
        (period//4,  degrees),
        (period//2,  0),
        (3*period//4, -degrees),
        (period,      0),
    ]
    for f, deg in key:
        pbone.rotation_mode = 'XYZ'
        pbone.rotation_euler[0] = radians(deg)
        pbone.keyframe_insert(data_path="rotation_euler", frame=f)
    # cycles
    act = arm.animation_data.action
    for fcu in act.fcurves:
        fcu.modifiers.new('CYCLES')
    bpy.ops.object.mode_set(mode='OBJECT')

def export(out_path, fmt="glb"):
    if fmt.lower() == "vrm":
        bpy.ops.export_scene.vrm(filepath=out_path)
    else:
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            export_yup=True,
            export_apply=True
        )

# ---------- Main ----------
with open(MAP_PATH, "r", encoding="utf-8") as f:
    cfg = json.load(f)

OUT_DIR = cfg["export"]["folder"]
ensure_folder(OUT_DIR)
fps = int(cfg["export"].get("fps", 24))
flap_deg = float(cfg["export"].get("flap_degrees", 25))
flap_period = int(cfg["export"].get("flap_period_frames", 48))
breath_deg = float(cfg["export"].get("breath_degrees", 2))
fmt = cfg["export"].get("format","glb")

for item in cfg["characters"]:
    clean_scene()
    char_name = item["name"]
    print(f"[BUILD] {char_name}")

    arm = import_vrm(item["vrm"])
    bone_map = armature_bone_names(arm)
    attach_bone = item.get("attach_bone") or bone_map["chest"] or bone_map["spine"]
    if not attach_bone:
        raise RuntimeError("No attachable chest/spine bone found")

    wings_info = item["wings"]
    wings_objs_before = set(bpy.data.objects)
    wings = import_wings(wings_info["file"], wings_info.get("preferred_import","fbx"))
    wings_objs = [o for o in bpy.data.objects if o not in wings_objs_before and o.type in {"MESH","EMPTY"}]
    if not wings_objs:
        # fallback: collect meshes with "wing" in the name
        wings_objs = [o for o in bpy.data.objects if o.type=="MESH" and "wing" in o.name.lower()]
    if not wings_objs:
        raise RuntimeError("Could not detect wings objects")

    # Put wings into a collection
    coll = ensure_collection("Wings")
    for o in wings_objs:
        if o.name not in coll.objects:
            try: coll.objects.link(o)
            except: pass

    # Auto scale by shoulder width
    shoulder_w = estimate_shoulder_width(arm, bone_map)
    # heuristic: aim wings span ~= 1.3 * shoulder width
    # measure current wings width from their bounding boxes
    minx, maxx =  1e9, -1e9
    for o in wings_objs:
        o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for v in o.bound_box:
            x = o.matrix_world @ bpy.mathutils.Vector(v)
            minx, maxx = min(minx, x.x), max(maxx, x.x)
    current_span = max(0.001, maxx - minx)
    target_span = shoulder_w * 1.3
    base_scale = target_span / current_span
    base_scale *= float(wings_info.get("scale_hint", 1.0))

    for o in wings_objs:
        o.scale = (o.scale[0]*base_scale, o.scale[1]*base_scale, o.scale[2]*base_scale)

    # Move wings to chest center + offset
    chest_center = center_of_bone_world(arm, attach_bone)
    ox, oy, oz = wings_info.get("offset", [0,0,-0.03])
    for o in wings_objs:
        o.location = (chest_center.x + ox, chest_center.y + oy, chest_center.z + oz)

    # Parent wings to attach bone
    for o in wings_objs:
        parent_to_bone(o, arm, attach_bone)

    # Animate: flap + chest breathing
    add_flap_animation(wings_objs, degrees=flap_deg, period=flap_period, fps=fps)
    add_chest_breath(arm, bone_name=attach_bone if "chest" in attach_bone.lower() else bone_map["chest"], degrees=breath_deg, period=flap_period*2, fps=fps)

    # Export
    out_name = f"{char_name.lower()}_wings.{fmt}"
    out_path = os.path.join(OUT_DIR, out_name)
    export(out_path, fmt=fmt)
    print(f"[OK] Exported {out_path}")
