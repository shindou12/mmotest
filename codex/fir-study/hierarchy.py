"""幹→大枝→小枝→葉房。既存のtubeとsprayを使って枝の単位で組む。"""
import math
from mathutils import Vector


def build(context):
    settings, rng = context["settings"], context["rng"]
    builder, lib = context["builder"], context["lib"]
    trunk, spray, up = context["trunk"], context["spray"], context["UP"]
    skeleton = []
    tuft_uv = tuple(settings.get("tuftUV", [.28, 1]))
    for tier, level in enumerate(settings["branchLevels"]):
        z, radius, count = level
        phase = tier * 2.29 + .28
        for k in range(count):
            angle = phase + math.tau * k / count + rng.uniform(-.13, .13)
            out = Vector((math.cos(angle), math.sin(angle), 0))
            side = Vector((-out.y, out.x, 0))
            length = radius * rng.uniform(.91, 1.06)
            root = trunk(z + rng.uniform(-.07, .07))
            bend = rng.uniform(-.09, .09)

            def point(t):
                return root + out * length * t + side * length * bend * math.sin(math.pi * t) + up * length * (.20 * t - .30 * t * t)

            branch_id = len(skeleton)
            path = [point(.90 * i / 5) for i in range(6)]
            thick = .025 + .033 * length
            lib["tube"](builder, path, [thick * (1 - i / 5) + .008 for i in range(6)], lib["M_BARK"](), sides=6, ao=(.64, .84))
            skeleton.append({"id": branch_id, "parent": "trunk", "tier": tier, "points": [list(p) for p in path]})

            # 大枝の途中から左右へ分かれる小枝。葉房の根は必ず親枝上に置く。
            forks = settings["forks"] if length > .8 else 2
            for pair in range(forks):
                t = .27 + pair * (.49 / max(1, forks - 1))
                for direction in [-1, 1]:
                    t_side = t + rng.uniform(-.04, .04)
                    origin = point(t_side)
                    child_angle = angle + direction * (.86 - .26 * t + rng.uniform(-.10, .10))
                    child_length = length * (.49 - .17 * t) * rng.uniform(.90, 1.10)
                    child_width = child_length * settings["tuftWidth"]
                    child_out = Vector((math.cos(child_angle), math.sin(child_angle), 0))
                    tip = origin + child_out * child_length + up * child_length * (.15 - .65)
                    child_id = len(skeleton)
                    lib["tube"](builder, [origin, origin.lerp(tip, .36) + up * .06, origin.lerp(tip, .72)], [.022 * length, .014 * length, .004], lib["M_BARK"](), sides=4, ao=(.65, .83))
                    skeleton.append({"id": child_id, "parent": branch_id, "tier": tier, "points": [list(origin), list(tip)]})
                    spray(origin, child_angle, child_length, child_width, .15, .65, .24,
                          "dense", tier, roll=direction * .18, arc=direction * .09,
                          parent=child_id, uv_span=tuft_uv, shade=rng.uniform(.92, 1.02))
                    if pair == 1 and length > .8 and k % 2 == 0:
                        # 同じ枝の下側に短い房を添え、薄い板1枚の形を弱める。
                        spray(origin - up * .10, child_angle + direction * .10, child_length * .84,
                              child_width * .90, -.18, .70, .18, "droop", tier,
                              roll=direction * .34, parent=child_id, uv_span=tuft_uv, shade=.77)
            # 枝の中心と先端にも葉を添え、左右の房が同じ枝の塊としてつながるようにする。
            for t in settings.get("centerTufts", [.13, .58]):
                tuft_length = length * (.85 if len(settings.get("centerTufts", [])) == 1 else .69 if t < .2 else .46)
                spray(point(t) + up * .045, angle, tuft_length, tuft_length * .77,
                      .15, .58, .25, "tip", tier, arc=bend, parent=branch_id,
                      uv_span=tuft_uv, shade=.96)
            if settings.get("rootTufts", False):
                # 若い上段ほど幹に近い短い房を長めに垂らし、段の間をつなぐ。
                inner_length = max(.50, length * .36)
                spray(point(.06), angle, inner_length, inner_length * .90,
                      -.72, .45, .25, "dense", tier, parent=branch_id,
                      uv_span=tuft_uv, shade=.84)
                if z < 4.9:
                    # 枝元の若い小枝は少し立ち上がり、上の段との間を内側から覆う。
                    origin = point(.035)
                    bud_length = min(.64, 5.18 - z)
                    spray(origin, angle + .22, bud_length, .46,
                          0, 0, .09, "dense", tier, parent=branch_id,
                          uv_span=tuft_uv, shade=.70, upright=True)

    # 最上部は短い若枝を上向きに伸ばす。水平な蓋を置かない。
    for k in range(2):
        spray(trunk(5.08), .6 + k * math.pi / 2, .40, .23,
              0, 0, .06, "tip", len(settings["branchLevels"]), upright=True,
              parent="trunk", uv_span=tuft_uv, shade=.92)
    return skeleton
