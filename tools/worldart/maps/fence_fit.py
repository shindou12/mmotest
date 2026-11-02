"""折れ線を実寸の柵で埋め、build_map.py 用の props を標準出力に出す。"""
import argparse
from decimal import Decimal
from functools import reduce
import json
import math


def asset_name(length):
    """cm 表記を名前にする。端数は p で区切り、長さを丸めない。"""
    cm = format(Decimal(str(length)) * 100, 'f')
    if '.' in cm:
        cm = cm.rstrip('0').rstrip('.')
    return 'fence_w_' + cm.replace('.', 'p')


def fit_lengths(distance, lengths, previous=None):
    """整数の最小単位で組み合わせを探す。同長の連続、部品数の順に抑える。"""
    values = set(Decimal(str(x)) for x in lengths)
    if not values or any(not x.is_finite() or x <= 0 for x in values):
        raise ValueError('部品の長さは正の有限数にしてください')
    digits = max(0, max(-x.as_tuple().exponent for x in values))
    scale = 10 ** digits
    integers = [int(x * scale) for x in values]
    unit = reduce(math.gcd, integers)
    steps = [x // unit for x in integers]
    target = round(distance * scale / unit)
    if abs(target * unit / scale - distance) > 0.001:
        raise ValueError(f'{distance:.6f}m を埋められません。端数用の短い部品を追加してください')
    # 同じ合計でも最後の長さごとに候補を残す。
    dp = {0: {previous: (0, 0, ())}}
    for amount in range(target + 1):
        for last, (repeats, count, sequence) in list(dp.get(amount, {}).items()):
            for value, step in zip(values, steps):
                nxt = amount + step
                if nxt > target:
                    continue
                length = float(value)
                candidate = (repeats + (last == length), count + 1, sequence + (length,))
                bucket = dp.setdefault(nxt, {})
                if length not in bucket or candidate < bucket[length]:
                    bucket[length] = candidate
    if target not in dp:
        raise ValueError(f'{distance:.6f}m を指定の部品で埋められません')
    return list(min(dp[target].values())[2])


def fence_fit(polyline, lengths):
    """各折れ点に柱を置く。+X の部品を three.js の Y 回転（度）へ合わせる。"""
    if len(polyline) < 2 or any(len(p) != 2 or not all(math.isfinite(x) for x in p) for p in polyline):
        raise ValueError('折れ線には有限な [x,z] を 2 点以上指定してください')
    props, previous = [], None
    for start, end in zip(polyline, polyline[1:]):
        dx, dz = end[0] - start[0], end[1] - start[1]
        distance = math.hypot(dx, dz)
        if distance <= 0:
            raise ValueError('折れ線に長さ 0 の辺があります')
        sequence = fit_lengths(distance, lengths, previous)
        # build_map.py scatter() は props.rot の度をラジアンへ変換する。
        rotation = -math.degrees(math.atan2(dz, dx))
        offset = 0.0
        for length in sequence:
            props.append(dict(asset=asset_name(length),
                              world=[round(start[0] + dx * offset / distance, 6),
                                     round(start[1] + dz * offset / distance, 6)], rot=rotation))
            offset += length
        previous = sequence[-1]
    props.append(dict(asset='fence_w_post', world=list(polyline[-1]), rot=rotation))
    return props


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--polyline', required=True, help='世界座標の JSON 配列 [[x,z],...]')
    parser.add_argument('--lengths', default='0.8,1.5,2,2.5,3')
    args = parser.parse_args()
    try:
        print(json.dumps(fence_fit(json.loads(args.polyline), [float(x) for x in args.lengths.split(',')]), indent=2))
    except ValueError as error:
        parser.error(str(error))


if __name__ == '__main__':
    main()
