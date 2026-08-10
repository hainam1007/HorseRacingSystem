# Bao Cao Model AI Du Doan Ti Le Thang Va Odds

## 1. Muc dich tai lieu

Tai lieu nay mo ta model AI dang duoc tich hop trong Horse Racing Management
System, bao gom:

- Model duoc huan luyen de lam gi.
- Dataset huan luyen va validation.
- Ket qua danh gia tren tap du lieu nam 2018.
- Toan bo nhom input va output.
- Cach model tinh `win_probability`, `fair_odds` va `game_odds`.
- Cach du lieu trong app duoc chuyen thanh input cua model.
- Cach ket qua model duoc luu va su dung trong luong betting.
- Gioi han hien tai va huong cai thien.

Tai lieu nay duoc doi chieu tu:

```text
app_probability_engine_history_v1_runtime/docs/MODEL_CARD.md
app_probability_engine_history_v1_runtime/artifacts/model_metadata_history_v1.json
app_probability_engine_history_v1_runtime/artifacts/evaluation_metrics_history_v1.json
app_probability_engine_history_v1_runtime/artifacts/feature_columns_history_v1.json
services/probabilityFeatureBuilderService.js
services/probabilityEngineService.js
services/raceOddsService.js
models/RaceOddsMarket.js
```

## 2. Thong tin model

| Thuoc tinh | Gia tri |
| --- | --- |
| Ten model | `probability_engine_history_v1` |
| Version | `history_v1.0.0` |
| Thuat toan | LightGBM binary classifier |
| Target | `won`: ngua ve nhat = 1, con lai = 0 |
| Ngay train trong model card | 2026-06-19 |
| Mien du lieu | HKJC thoroughbred racing |
| Muc dich trong app | Tao ti le thang va fixed odds cho virtual betting |
| Khong dung cho | Ca cuoc tien that, tu van tai chinh, du doan race ngoai doi |

Day la model tabular supervised learning. Moi dong du lieu dai dien cho mot ngua
trong mot race. Model hoc moi quan he giua thong tin truoc race, lich su thi dau
va kha nang ngua do ve nhat.

Model nay khong phai LLM va khong sinh noi dung ngon ngu. No la model Gradient
Boosted Decision Trees duoc toi uu cho du lieu dang bang.

## 3. Dataset

Nguon du lieu theo model card:

```text
eprochasson/horserace_data
Hong Kong Jockey Club
```

Pham vi:

| Tap du lieu | So race | So runner | Thoi gian |
| --- | ---: | ---: | --- |
| Training | 1,057 | 12,969 | 2016-2017 |
| Validation | 452 | 5,472 | 2018 |
| Tong | 1,509 | 18,441 | 2016-2018 |

Du lieu 2018 chi co mot phan den ngay 2018-06-27.

Ty le dong du lieu co target `won = 1`:

| Tap | Ti le |
| --- | ---: |
| Training | 8.18% |
| Validation | 8.26% |

Ty le nay thap la binh thuong vi moi race chi co mot ngua thang trong nhieu
runner.

## 4. Cach chia du lieu

Model dung chronological split:

```text
Training: race truoc 2018-01-01
Validation: race tu 2018-01-01 tro di
```

Khong dung random row split. Cach chia theo thoi gian giup danh gia gan voi thuc
te hon: model chi hoc tu qua khu va du doan cac race trong tuong lai.

Historical features cung chi duoc tinh tu race da xay ra truoc race dang du
doan. Nguyen tac nay ngan data leakage tu ket qua tuong lai.

## 5. Ket qua tren validation set 2018

Nguon so lieu:

```text
app_probability_engine_history_v1_runtime/artifacts/evaluation_metrics_history_v1.json
```

| Metric | Ket qua | Y nghia |
| --- | ---: | --- |
| Top-1 accuracy | **22.12%** | Ngua co probability cao nhat thang 22.12% so race |
| Top-3 capture | **48.45%** | Ngua thang nam trong top 3 model o 48.45% so race |
| Log loss | **0.2784** | Danh gia chat luong probability; cang thap cang tot |
| Brier score | **0.0746** | Sai so giua probability va ket qua thuc; cang thap cang tot |
| Calibration MAE | **0.0590** | Sai so calibration trung binh theo probability bin |
| Favorite win rate | **22.12%** | Cung cach dien giai thuc te nhu Top-1 accuracy |
| Mean entropy | **2.4757** | Muc do phan tan probability trong race |

### 5.1 Hieu dung con so 22.12%

`Top-1 accuracy = 22.12%` khong co nghia model "chi dung 22.12% tren moi du
lieu".

No co nghia:

```text
Voi moi race, chon ngua co win_probability cao nhat.
Trong 452 race validation nam 2018, lua chon do thang khoang 22.12% so race.
```

Tuong duong xap xi:

```text
452 * 22.12% ~= 100 race co favorite cua model ve nhat.
```

Day la bai toan kho vi moi race co nhieu runner nhung chi mot runner thang.

### 5.2 Hieu dung con so 48.45%

`Top-3 capture = 48.45%` co nghia ngua thang thuc te nam trong ba ngua model
danh gia cao nhat o gan mot nua so race validation.

Metric nay dung de danh gia kha nang ranking. Tuy nhien model hien tai chi tao
`win_probability`; no chua tao probability ve top 2 hoac top 3 rieng.

## 6. Cong nghe su dung

### 6.1 Model va xu ly du lieu

| Cong nghe | Phien ban yeu cau | Vai tro |
| --- | --- | --- |
| Python | 3.11 trong Docker image | Chay probability engine va HTTP service |
| LightGBM | >= 3.3.0 | Binary classifier du doan raw winner score cho tung horse |
| pandas | >= 1.3.0 | Chuyen payload cua mot race thanh bang du lieu theo feature schema |
| NumPy | >= 1.21.0 | Xu ly vector, softmax, probability va phep tinh odds |
| scikit-learn | >= 1.0.0 | Preprocessing numeric/categorical features truoc khi infer |
| joblib | >= 1.1.0 | Nap preprocessing artifact da duoc train |

Model artifact duoc luu dang LightGBM text model. Preprocessor, feature schema,
metadata va metrics duoc dong goi kem runtime de moi lan infer dung dung thu tu
feature va phep bien doi da dung luc training.

### 6.2 API va deploy model

| Cong nghe | Phien ban yeu cau | Vai tro |
| --- | --- | --- |
| FastAPI | >= 0.110.0 | Cung cap `/health`, `/metadata`, `/predict` va `/simulate` |
| Uvicorn | >= 0.27.0 | ASGI server chay FastAPI |
| Docker | Python 3.11 slim | Dong goi model, dependency va API thanh mot runtime doc lap |
| Hugging Face Spaces | Docker Space | Host probability engine de app goi qua HTTPS |
| JSON/REST | HTTP request-response | Dinh dang input va output giua app va model |

Container cai them `libgomp1`, la runtime OpenMP can cho LightGBM tren Linux.
Service mo port `7860` va khoi dong bang:

```text
uvicorn api:app --host 0.0.0.0 --port 7860
```

### 6.3 Cong nghe tich hop trong app

| Cong nghe | Vai tro |
| --- | --- |
| Node.js | Chay server va orchestration cua luong generate odds |
| Express | Cung cap race odds va betting APIs |
| Axios | Gui payload den probability engine khi chay HTTP mode |
| Mongoose + MongoDB | Doc race, horse, jockey, historical results va luu odds snapshot |
| Node child process | Goi Python runtime truc tiep khi chay local mode |
| Environment variables | Chon local/HTTP mode, URL model va timeout |

App khong load LightGBM model truc tiep trong Node.js. App tao feature payload,
gui payload den Python runtime, nhan probability/odds, validate ket qua, sau do
luu snapshot vao MongoDB.

```text
Race data trong MongoDB
        |
        v
Node.js feature builder
        |
        v
FastAPI /predict tren Python runtime
        |
        v
Preprocessor -> LightGBM -> softmax -> odds
        |
        v
Node.js validate va luu RaceOddsMarket
        |
        v
API odds va betting cua app
```

### 6.4 Ly do tach model thanh service rieng

- Python co he sinh thai ML phu hop voi LightGBM va preprocessing artifacts.
- Node.js tiep tuc quan ly nghiep vu race, wallet, bet va database.
- Model co the deploy, test va cap nhat version doc lap voi app.
- HTTP mode phu hop cho production/demo online; local mode phu hop cho test.
- Model failure khong lam thay doi race result engine; hai thanh phan co trach
  nhiem rieng.

## 7. Cau hinh training

Theo model card:

```text
num_leaves = 31
learning_rate = 0.05
feature_fraction = 0.9
bagging_fraction = 0.8
bagging_freq = 5
num_boost_round = 200
```

Tien xu ly:

- Numeric features duoc standardize bang `StandardScaler`.
- Categorical features duoc target encoding.
- Target encoding co smoothing `alpha = 10`.
- Preprocessor chi fit tren training set.
- Category chua tung xuat hien duoc map ve global mean.

### 7.1 Tao nhan training

Moi dong du lieu dai dien cho mot horse trong mot race. Nhan `y_i` duoc tao tu
ket qua chinh thuc:

```text
y_i = 1, neu finish_position_i = 1
y_i = 0, neu finish_position_i != 1
```

Day la bai toan binary classification: model hoc horse co thang race hay khong,
khong hoc truc tiep finish position 2, 3 hoac thoi gian ve dich.

### 7.2 StandardScaler cho numeric features

Voi numeric feature `x`, mean `mu` va standard deviation `sigma` chi duoc tinh
tren training set:

```text
x_scaled = (x - mu) / sigma
```

Phep bien doi nay dua cac numeric feature ve cung thang do. Validation va du
lieu tu app phai dung lai `mu`, `sigma` da luu trong preprocessor; khong duoc fit
lai de tranh data leakage.

### 7.3 Target encoding cho categorical features

Voi category `c`, runtime training dung target encoding co smoothing:

```text
category_mean_c = sum(y_i trong category c) / count_c
global_mean = sum(y_i trong training set) / total_training_rows

encoded_c =
  (count_c * category_mean_c + alpha * global_mean)
  / (count_c + alpha)

alpha = 10
```

Category co nhieu du lieu se gan voi win rate lich su cua chinh no. Category co
it du lieu se bi keo ve `global_mean`, giup giam overfitting. Category moi chua
tung xuat hien khi training duoc gan `global_mean`.

### 7.4 Cong thuc LightGBM hoc score

LightGBM la gradient boosted decision trees. Model cuoi cung la tong score cua
nhieu cay:

```text
F_0(x) = initial_score
F_m(x) = F_(m-1)(x) + learning_rate * tree_m(x)

learning_rate = 0.05
num_boost_round = 200
```

Moi cay moi hoc de sua phan sai so con lai cua cac cay truoc. Raw score sau vong
cuoi duoc chuyen thanh binary probability bang sigmoid:

```text
q_i = sigmoid(F(x_i))
    = 1 / (1 + exp(-F(x_i)))
```

Trong training, loss chinh cua binary classifier la binary log loss:

```text
L = -(1 / N) * sum(
      y_i * ln(q_i)
      + (1 - y_i) * ln(1 - q_i)
    )
```

Model tim cac tree split va leaf value de lam `L` giam dan. Du doan sai voi muc
do tu tin cao bi phat loss lon hon du doan sai nhung it tu tin.

### 7.5 Toan bo training flow

```text
Du lieu race 2016-2017
-> sap xep va chia theo thoi gian
-> tao target won
-> tao 29 historical features chi tu race qua khu
-> fit StandardScaler tren numeric features
-> fit target encoding tren categorical features
-> train 200 LightGBM boosting rounds
-> luu model + preprocessor + feature schema
-> danh gia rieng tren race nam 2018
```

## 8. Input cua model

Runtime nhan payload theo race:

```json
{
  "race_info": {
    "race_date": "2026-07-28T08:00:00.000Z",
    "venue": "ST",
    "race_no": 1
  },
  "horses": [
    {
      "horse_no": 1,
      "horse_name": "Northern Dancer",
      "draw": 1,
      "rating": 55,
      "declared_weight": 120.15,
      "distance": 1200,
      "jockey": "James Doyle",
      "trainer": "Godolphin Stable",
      "gears": "B/TT",
      "course": "B+2",
      "race_class": "5",
      "going": "Good",
      "surface": "Turf",
      "hist_horse_prior_starts": 10,
      "hist_horse_prior_wins": 2
    }
  ]
}
```

Vi du tren rut gon cac `hist_*`. Runtime thuc te yeu cau du 29 historical
features.

### 8.1 Race identifiers

Nhung field nay xac dinh race va phuc vu feature building:

```text
race_date
venue
race_no
horse_no
horse_name
horse_id
```

Chung khong deu la feature truc tiep cua LightGBM.

### 8.2 Bon numeric pre-race features

| Field | Y nghia |
| --- | --- |
| `draw` | So xuat phat cua ngua |
| `rating` | Danh gia nang luc ngua truoc race |
| `declared_weight` | Khoi luong khai bao theo lbs |
| `distance` | Cu ly race theo met |

### 8.3 Bay categorical features

```text
jockey
trainer
gears
course
race_class
going
surface
```

### 8.4 Hai muoi chin historical features

Horse history:

```text
hist_horse_prior_starts
hist_horse_prior_wins
hist_horse_prior_places
hist_horse_prior_win_rate
hist_horse_prior_place_rate
hist_horse_last_3_finish_avg
hist_horse_last_5_finish_avg
hist_horse_last_3_win_rate
hist_horse_last_5_win_rate
hist_horse_days_since_last_race
hist_horse_same_distance_starts
hist_horse_same_distance_win_rate
hist_horse_same_venue_starts
hist_horse_same_venue_win_rate
hist_horse_same_going_starts
hist_horse_same_going_win_rate
```

Jockey history:

```text
hist_jockey_prior_starts
hist_jockey_prior_wins
hist_jockey_prior_win_rate
hist_jockey_last_30d_win_rate
hist_jockey_last_90d_win_rate
```

Trainer history:

```text
hist_trainer_prior_starts
hist_trainer_prior_wins
hist_trainer_prior_win_rate
hist_trainer_last_30d_win_rate
hist_trainer_last_90d_win_rate
```

Jockey-trainer combination:

```text
hist_jockey_trainer_prior_starts
hist_jockey_trainer_prior_wins
hist_jockey_trainer_prior_win_rate
```

Tong feature LightGBM:

```text
4 numeric pre-race
+ 29 historical numeric
+ 7 categorical
= 40 features
```

## 9. App map du lieu sang input nhu the nao

| Input model | Nguon trong app | Fallback |
| --- | --- | --- |
| `race_date` | `Race.race_date` | Thoi gian hien tai |
| `venue` | `Race.venue_code`, venue/location normalization | `ST` |
| `race_no` | `Race.race_no`, sau do parse tu ten race | `1` |
| `distance` | `Race.distance` | `1200` |
| `horse_no` | `Registration.horse_no` | Thu tu registration |
| `horse_name` | `Horse.name` | `Horse N` |
| `draw` | `Registration.draw` | Thu tu registration |
| `rating` | `Registration.rating_snapshot`, `Horse.current_rating` | `50` |
| `declared_weight` | `Registration.declared_weight_kg * 2.20462` | `54.5 kg` roi doi sang lbs |
| `jockey` | Accepted primary jockey | `Unknown Jockey` |
| `trainer` | Stable/horse owner duoc dung lam trainer proxy | `Demo Trainer` |
| `gears` | `Registration.gears` | Chuoi rong |
| `course` | `Race.course` | `B+2` |
| `race_class` | `Race.race_class` | `5` |
| `going` | `Race.going` | `Good` |
| `surface` | `Race.surface` | `Turf` |
| `hist_*` | Cac `RaceResult` da published truoc race hien tai | Neutral defaults |

Draw hien tai duoc he thong gan theo thu tu registration da approved:

```text
Registration som nhat -> draw 1
Registration tiep theo -> draw 2
...
Registration cuoi -> draw N
```

Neu chua co history:

```text
count = 0
rate = 0
finish average = 8
days since last race = 365
```

He thong luu danh sach fallback tai:

```text
RaceOddsMarket.input_diagnostics.fallbacks_used
RaceOddsMarket.odds[].fallbacks_used
```

Vi vay admin co the biet race nao dang phu thuoc nhieu vao du lieu gia dinh.

## 10. Nguyen tac chong data leakage trong app

Historical features chi dung:

```text
RaceResult.status = published
RaceResult.race_id.race_date < Race.race_date dang du doan
```

Khong duoc dua vao model:

- Ket qua cua race hien tai.
- Finish time cua race hien tai.
- Prize cua race hien tai.
- Violation trong race hien tai.
- Post-race check.
- Referee report sau race.

Neu race date bi dat sai, dac biet dat ve qua khu, historical feature co the bi
thieu hoac sai ngu canh thoi gian.

## 11. Model tao win probability nhu the nao

Flow runtime:

```text
Payload JSON
-> validate schema
-> chuyen horses thanh DataFrame
-> target encode categorical fields
-> scale numeric fields
-> LightGBM predict mot score cho moi ngua
-> softmax trong pham vi mot race
-> win_probability co tong bang 1
```

Voi score cua ngua `i`:

```text
score_i = LightGBM(features_i)
```

Softmax:

```text
win_probability_i =
  exp(score_i - max_score)
  / sum(exp(score_j - max_score))
```

He thong kiem tra:

```text
abs(sum(win_probability) - 1) <= 0.0001
```

Neu khong dat, qua trinh generate odds bi tu choi.

### Luu y ve softmax hien tai

LightGBM binary `predict()` co the tra gia tri da mang tinh probability. Runtime
lai dua cac gia tri nay qua softmax. Cach lam nay co the nen chenh lech giua cac
ngua, lam probability gan nhau hon.

Dieu nay chap nhan duoc cho demo hien tai, nhung can danh gia lai neu muon odds
phan hoa manh va calibration tot hon.

## 12. Output cua model

```json
{
  "race_id": "2026-07-28T08:00:00.000Z_ST_1",
  "race_date": "2026-07-28T08:00:00.000Z",
  "venue": "ST",
  "race_no": 1,
  "horses": [
    {
      "horse_no": 1,
      "horse_name": "Northern Dancer",
      "win_probability": 0.25,
      "fair_odds": 4.0,
      "game_odds": 3.4,
      "probability_rank": 1
    }
  ]
}
```

| Output | Y nghia |
| --- | --- |
| `win_probability` | Ti le thang cua ngua sau normalize trong race |
| `fair_odds` | Decimal odds ly thuyet khong co payout reduction |
| `game_odds` | Odds app dung cho virtual payout |
| `probability_rank` | Thu tu probability, 1 la cao nhat |

## 13. Cong thuc odds

Voi:

```text
p = win_probability
```

Fair decimal odds:

```text
fair_odds = 1 / p
```

Game odds:

```text
game_odds = fair_odds * 0.85
```

Sau do clamp:

```text
1.01 <= game_odds <= 99.0
```

Vi du:

```text
p = 0.25
fair_odds = 1 / 0.25 = 4.00
game_odds = 4.00 * 0.85 = 3.40
```

`0.85` la payout factor cua app. App tra thap hon fair odds 15%. Day la quy tac
game odds cua virtual betting, khong phai market odds ngoai doi.

### 13.1 Tu probability den ty le bet

Model chi tao `win_probability`. Ty le bet ma user thay duoc tao theo chuoi:

```text
model_output_i = LightGBM.predict(features_i)

win_probability_i =
  exp(model_output_i - max_model_output)
  / sum(exp(model_output_j - max_model_output))

fair_odds_i = 1 / win_probability_i

generated_game_odds_i =
  clamp(fair_odds_i * 0.85, 1.01, 99.0)
```

Trong do:

- `model_output` trong runtime hien tai la ket qua cua `predict()`; voi LightGBM
  binary classifier, gia tri nay co the da la binary probability truoc softmax.
- `win_probability` la ty le thang du doan cua model trong race.
- `fair_odds` la decimal odds ly thuyet neu tra thuong dung theo probability.
- `generated_game_odds` la odds de xuat sau khi giam payout 15%.
- `game_odds` la odds cuoi cung sau khi admin review/chinh tay.

### 13.2 Implied probability cua odds

Neu can doi decimal odds nguoc lai thanh probability ngam y:

```text
implied_probability = 1 / decimal_odds
```

Vi du voi `game_odds = 3.40`:

```text
implied_probability = 1 / 3.40
                    ~= 0.2941
                    ~= 29.41%
```

Con so nay khac `win_probability = 25%` vi odds da bi nhan voi payout factor
`0.85`. Do do khong nen hien `1 / game_odds` nhu du doan goc cua model.

### 13.3 Cong thuc payout khi dat cuoc

Tai thoi diem dat cuoc, app luu `game_odds` vao odds snapshot de lan thay doi
odds sau khong lam thay doi bet da dat.

```text
potential_payout = stake_amount * odds_snapshot.game_odds
```

Neu horse thang:

```text
total_return = potential_payout
net_profit = potential_payout - stake_amount
```

Neu horse khong thang:

```text
total_return = 0
net_profit = -stake_amount
```

Vi du user dat `100` token voi odds `3.40`:

```text
potential_payout = 100 * 3.40 = 340 token
net_profit neu thang = 340 - 100 = 240 token
net_profit neu thua = -100 token
```

### 13.4 Y nghia cua payout factor 0.85

Voi fair odds `1 / p`, expected gross return theo probability cua model la:

```text
expected_gross_return
  = p * stake * (1 / p) * 0.85
  = stake * 0.85
```

Theo cong thuc ly thuyet va bo qua clamp/admin adjustment, expected return cua
user bang 85% stake, tuong duong payout reduction 15%. Day la he so cau hinh cho
virtual betting, khong phai khang dinh house edge thuc te se dung 15% tren du
lieu demo, vi model co prediction error va admin co the chinh `game_odds`.

## 14. Cach model duoc ap dung vao app

### 14.1 Generate odds

Admin goi:

```text
POST /api/races/:raceId/odds/generate
```

Flow:

```text
1. Gan draw 1..N theo thu tu approved registration.
2. Lay cac registration da approved.
3. Lay accepted primary jockey.
4. Lay horse, owner/stable va race configuration.
5. Tinh 29 historical features tu published results trong qua khu.
6. Ghi nhan fallback.
7. Goi model local hoac HTTP.
8. Kiem tra tong probability bang 1.
9. Luu snapshot vao RaceOddsMarket.
10. Chuyen betting status cua race thanh generated.
```

Toi thieu hai approved registrations moi duoc generate odds.

Missing model fields khong chan generate. He thong dung fallback va ghi lai
diagnostics de ho tro demo.

### 14.2 Luu odds snapshot

Moi horse trong `RaceOddsMarket.odds[]` luu:

```text
horse_id
jockey_id
horse_no
horse_name
jockey_name
win_probability
fair_odds
generated_game_odds
game_odds
probability_rank
fallbacks_used
```

`generated_game_odds` giu odds model ban dau. `game_odds` la odds cuoi duoc app
su dung.

### 14.3 Admin dieu chinh odds

Sau khi generate va truoc khi betting open, admin co the dieu chinh
`game_odds`.

Dieu kien:

- Market phai o status `generated`.
- Chua co bet nao.
- Payload phai co moi horse dung mot lan.

`win_probability`, `fair_odds` va `generated_game_odds` van duoc giu de audit.

### 14.4 Betting flow

```text
Generate odds
-> Admin review/adjust game odds
-> Open betting
-> Spectator dat win bet bang TOKEN
-> Race start tu dong close betting
-> Official result duoc publish
-> Bet duoc settle won/lost
```

Payout:

```text
potential_payout = stake_amount * odds_snapshot.game_odds
```

Bet luu odds snapshot tai thoi diem dat cuoc. Admin khong the thay doi payout cua
bet da ton tai bang cach sua odds sau do.

## 15. Quan he voi Race Engine

Probability model va Race Engine la hai thanh phan khac nhau:

| Thanh phan | Trach nhiem |
| --- | --- |
| Probability model | Tao pre-race win probability va odds |
| Race Engine | Tao thu tu ket qua demo cua race |
| Violation/penalty flow | Dieu chinh official result sau race |

Model AI khong quyet dinh official winner cua race hien tai. Race Engine van tao
ket qua demo rieng. Violation da confirmed co the cong thoi gian, ha hang hoac
disqualify truoc khi official result duoc publish.

Dieu nay co nghia ngua co probability cao nhat khong bat buoc phai thang.

## 16. Runtime mode

### Local

```env
PROBABILITY_ENGINE_MODE=local
PROBABILITY_ENGINE_PYTHON=python
PROBABILITY_ENGINE_TIMEOUT_MS=30000
```

Node.js tao temporary JSON, chay Python runtime va doc output.

### HTTP

```env
PROBABILITY_ENGINE_MODE=http
PROBABILITY_ENGINE_URL=https://son2110-horse-racing-probability-engine.hf.space/predict
PROBABILITY_ENGINE_TIMEOUT_MS=30000
```

Node.js gui payload den model da deploy va unwrap response:

```json
{
  "success": true,
  "data": {
    "horses": []
  }
}
```

## 17. Gioi han hien tai

1. Dataset chi thuoc HKJC giai doan 2016-2018.
2. Validation 2018 chi den 2018-06-27.
3. Model chua duoc train bang du lieu phat sinh tu app.
4. Nhieu horse moi se khong co historical results va phai dung fallback.
5. Owner/stable dang duoc dung lam trainer proxy.
6. Category moi co the bi map ve global mean.
7. Probability calibration chua hoan hao.
8. Softmax co the nen chenh lech probability.
9. Model chi ho tro win probability.
10. Chua co place/show probability, exacta hoac trifecta.
11. Model khong xu ly late scratching, weather update hoac jockey change sau
    thoi diem generate.
12. Free HTTP hosting co the sleep va tang latency o request dau tien.

## 18. Khuyen nghi su dung

Cho demo hien tai:

- Dung model de tao virtual win odds.
- Hien thi day la simulated odds.
- Theo doi `fallbacks_used` khi demo.
- Generate sau khi participant va primary jockey da on dinh.
- Chi open betting sau khi admin review odds.

Neu nang cap chat luong:

1. Thu thap them published race results trong app.
2. Retrain theo du lieu app va chia theo thoi gian.
3. Calibrate probability bang Platt scaling hoac isotonic regression.
4. Kiem tra raw margin cua LightGBM thay vi softmax tren probability.
5. Them field size, prize level va race condition neu co du lieu train tuong
   ung.
6. Them place/show model rieng neu mo rong bet type.
7. Theo doi metrics theo tung thang va tung nhom race.

## 19. Checklist demo

```text
[ ] Race co it nhat 2 approved registrations.
[ ] Moi horse co accepted primary jockey.
[ ] Race date, distance, venue va condition hop ly.
[ ] Draw da duoc gan theo registration order.
[ ] Model runtime local hoac HTTP dang hoat dong.
[ ] Generate odds thanh cong.
[ ] Tong win_probability xap xi 1.
[ ] Kiem tra fallbacks_used.
[ ] Admin review game odds.
[ ] Open betting.
[ ] Spectator dat win bet.
[ ] Start race dong betting.
[ ] Publish official result.
[ ] Bet duoc settle va wallet cap nhat.
```

## 20. Lenh kiem tra

Runtime:

```powershell
cd app_probability_engine_history_v1_runtime
python -m unittest tests/test_runtime_engine.py
```

He thong:

```powershell
npm.cmd test
```

Bat bien can dat:

```text
sum(win_probability) ~= 1
fair_odds ~= 1 / win_probability
game_odds ~= fair_odds * 0.85
1.01 <= game_odds <= 99
```

## 21. Ket luan

`history_v1.0.0` la model LightGBM tao win probability cho virtual betting.
Tren 452 race validation nam 2018:

```text
Top-1 accuracy: 22.12%
Top-3 capture: 48.45%
Log loss: 0.2784
Brier score: 0.0746
```

Model dat kha nang chon winner va ranking o muc phu hop cho demo, nhung
calibration van chua hoan hao. Vi vay model phu hop de demo odds va virtual
betting trong app, nhung khong nen duoc mo ta nhu model ca cuoc tien that hoac
odds thi truong.
