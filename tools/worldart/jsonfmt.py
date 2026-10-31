"""地図 JSON を読みやすく書き直す（数の配列は1行に）。python3 -I tools/worldart/jsonfmt.py <file.json>"""
import json, sys, re
def dump(o, ind=0):
    sp = '  ' * ind
    if isinstance(o, dict):
        if not o: return '{}'
        return '{\n' + ',\n'.join(f'{sp}  {json.dumps(k, ensure_ascii=False)}: {dump(v, ind + 1)}' for k, v in o.items()) + f'\n{sp}}}'
    if isinstance(o, list) and all(not isinstance(x, (dict,)) for x in o) and len(json.dumps(o)) < 160:
        return json.dumps(o, ensure_ascii=False)
    if isinstance(o, list):
        return '[\n' + ',\n'.join(f'{sp}  {dump(v, ind + 1)}' for v in o) + f'\n{sp}]'
    return json.dumps(o, ensure_ascii=False)
for p in sys.argv[1:]:
    d = json.load(open(p)); open(p, 'w').write(dump(d) + '\n')
