# Violation Penalty Policy

## 1. Muc dich

Tai lieu nay quy dinh cach app Horse Racing phan loai vi pham va ap dung penalty.
Day la policy nghiep vu cua app, duoc tham khao tu cac nguyen tac cua BHA, HISA
va IFHA. No khong thay the quy dinh chinh thuc cua mot co quan dua ngua cu the.

He thong la nguon policy va luu penalty cuoi cung. Giao dien hien suggestion,
cho Referee chon penalty trong pham vi cho phep, va yeu cau ly do khi quyet
dinh khac policy. Referee la nguoi ra quyet dinh cuoi cung cho moi loai vi pham.

## 2. Muc do vi pham

### `minor`

- Khong lam thay doi ket qua cuoc dua.
- Khong tao nguy co an toan dang ke.
- Thuong ap dung `warning` hoac time penalty nho.

### `major`

- Gay can tro, tao loi the khong cong bang hoac lam thay doi ket qua.
- Co nguy co anh huong den ngua, jockey hoac nguoi tham gia khac.
- Thuong ap dung time penalty, ha hang hoac dinh chi ngan han.

### `critical`

- Gay nguy hiem nghiem trong, gian lan, doping hoac nguoc dai ngua.
- Co the lam mat tinh toan ven cua cuoc dua.
- Thuong ap dung disqualification va dinh chi.

## 3. Bang penalty mac dinh

| Vi pham | Minor | Major | Critical |
|---|---|---|---|
| `dangerous_riding` | `warning` | Ha 2 hang | DQ, dinh chi 7 ngay |
| `interference` | `warning` | Ha 1 hang | DQ |
| `illegal_whip_use` | `warning` | Dinh chi 3 ngay | DQ, dinh chi 7 ngay |
| `lane_violation` | Cong 1 giay | Cong 3 giay | DQ |
| `false_start` | `warning` | Ha 1 hang | DQ neu tai pham hoac co tinh |
| `equipment_violation` | `warning`, yeu cau khac phuc | Khong cho xuat phat | DQ neu phat hien sau khi dua |
| `horse_abuse` | `warning` | DQ, dinh chi 14 ngay | DQ, dinh chi 30 ngay |
| `disobey_referee` | `warning` | Ha 1 hang | DQ, dinh chi 7 ngay |
| `doping_suspected` | `warning` | DQ, dinh chi 30 ngay | DQ, dinh chi 30 ngay |
| `track_safety_issue` | Khong phat ca nhan | Tam dung race | Huy race |
| `other` | Referee quyet dinh | Referee quyet dinh | Referee quyet dinh |

`DQ` la `disqualification`. Khi DQ, `final_position` cua ket qua bang `null`.

## 4. Penalty object tuong ung

### Canh cao

```json
{
  "type": "warning",
  "note": "Official warning"
}
```

### Cong thoi gian

BE cong `time_penalty_seconds` vao `raw_finish_time` de tao
`final_finish_time`.

```json
{
  "type": "time_penalty",
  "time_penalty_seconds": 3
}
```

### Ha hang

```json
{
  "type": "position_demotion",
  "position_delta": 1
}
```

### Dinh chi

```json
{
  "type": "suspension",
  "suspension_days": 7
}
```

### Disqualification kem dinh chi

```json
{
  "type": "disqualification",
  "disqualified": true,
  "suspension_days": 7
}
```

## 5. Quy tac goi y, khong auto-confirm

BE co the tu dong de xuat penalty khi referee chon:

```json
{
  "violation_type": "interference",
  "severity": "major"
}
```

Penalty de xuat:

```json
{
  "type": "position_demotion",
  "position_delta": 1
}
```

Suggestion duoc snapshot vao `suggested_penalty` luc tao violation. He thong
khong auto-confirm va khong ghi `penalty` o buoc nay, ke ca client cu gui
`auto_confirm: true`.

Penalty chi anh huong den RaceResult sau khi violation co status `confirmed`.
Violation `recorded` va `under_review` phai chan finalization.

## 6. Quyen quyet dinh cua Referee

- Referee co the confirm hoac dismiss moi loai vi pham.
- Moi loai penalty deu co the duoc chon trong bounds cua muc do vi pham.
- Neu penalty khac suggestion, `deviation_reason` la bat buoc.
- Neu gia tri vuot bounds, request bi tu choi de Referee chinh lai.
- Violation `under_review` cu van duoc xem la chua xu ly va Referee co the quyet dinh.

## 7. Flow tren giao dien referee

1. Referee chon ngua hoac jockey trong race.
2. Referee tich loai vi pham.
3. Referee chon `minor`, `major` hoac `critical`.
4. Giao dien hien penalty do he thong de xuat de referee kiem tra.
5. Referee them mo ta, moc thoi gian va evidence.
6. Referee chon penalty de xuat. Radio button dung cho primary sanction;
   checkbox dung cho suspension/fine bo sung.
7. Neu khac policy, Referee bat buoc ghi `deviation_reason`.
8. He thong confirm ngay neu decision nam trong bounds; neu vuot bounds thi
   yeu cau Referee chinh lai.
9. He thong luu suggestion, proposal, final decision va audit nguoi ra quyet dinh.
10. Khi tinh ket qua, he thong ap dung violation `confirmed` tu `raw_*` sang `final_*`.
11. Trong tai duoc phan cong kiem tra, xac nhan va publish ket qua.

## 8. Payload FE gui BE

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "jockey_id": "jockey_profile_id",
  "violation_type": "lane_violation",
  "severity": "major",
  "description": "Horse crossed the assigned lane",
  "time_marker": "00:42",
  "evidence_files": [
    {
      "file_data": "data:image/jpeg;base64,...",
      "type": "image/jpeg",
      "file_name": "camera-01.jpg"
    }
  ]
}
```

BE tra penalty de xuat:

```json
{
  "violation_type": "lane_violation",
  "severity": "major",
  "requires_review": false,
  "suggested_penalty": {
    "type": "time_penalty",
    "time_penalty_seconds": 3
  },
  "referee_adjustment": {
    "allowed": true,
    "primary_types": [
      "warning",
      "score_deduction",
      "time_penalty",
      "position_demotion",
      "disqualification",
      "suspension",
      "fine"
    ],
    "bounds": {
      "time_penalty_seconds": { "min": 1, "max": 5, "step": 1 }
    }
  }
}
```

Referee submit decision:

```json
{
  "decision": "Confirmed after multi-angle video review.",
  "penalty": {
    "type": "time_penalty",
    "time_penalty_seconds": 2
  },
  "deviation_reason": "The runner was partially forced outward."
}
```

Audit fields:

```text
suggested_penalty: policy snapshot
proposed_penalty: Referee proposal
penalty: final confirmed penalty only
deviates_from_policy: comparison result
deviation_reason: required when different
decision_scope: referee match, adjustment, dismissal
```

## 9. Nguon tham khao

- BHA Whip Rules: https://www.britishhorseracing.com/regulation/the-whip-2-2-2/
- HISA Regulations: https://hisaus.org/regulations
- IFHA International Agreement: https://www.ifhaonline.org/default.asp?section=IABRW&area=2

BHA quy dinh nguong su dung whip va co the disqualify khi vuot nguong nghiem
trong. IFHA su dung anh huong thuc te den ket qua de xu ly interference. HISA
tach cac van de an toan, welfare va doping thanh quy trinh dieu tra va enforcement.

## 10. Trang thai trien khai

Backend hien tai da ho tro:

- Violation type, severity va status enum.
- Penalty object co cau truc.
- Confirm va dismiss violation.
- Ap dung penalty vao RaceResult tu `raw_*` sang `final_*`.
- Chan finalize khi con violation chua duoc xu ly.
- Tu dong map `violation_type + severity -> suggested_penalty`.
- API preview penalty cho FE.
- Khong auto-confirm; Referee phai submit penalty decision.
- Referee duoc chon moi loai penalty trong bounds va phai ghi ly do neu khac policy.
- Proposal vuot bounds bi tu choi de Referee chinh lai.
- Referee confirm hoac dismiss moi loai vi pham, bao gom doping, horse abuse,
  track safety va `other`.
- Khoa violation sau khi ket qua da `confirmed` hoac `published`.
- Thuc thi suspension va fine mot lan khi trong tai bulk confirm race.
- Chan jockey dang suspension nhan assignment hoac tham gia race.
