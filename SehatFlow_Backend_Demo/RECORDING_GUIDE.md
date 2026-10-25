# SehatFlow ML demo — screen-recording and voice-over guide

Target length: about 2 minutes 15 seconds. Speak calmly and pause briefly after each chart/metric so judges can read it. Keep the **SYNTHETIC DEMO DATA ONLY** label visible.

## Shot 1 — purpose (0:00–0:10)
**On screen:** dashboard header and the two tabs.

**Voice-over:**
“SehatFlow demonstrates two separate prediction tasks: estimating aggregate outpatient traffic by day, and estimating how long a consultation may take. I’ll show the data, the model inputs, the evaluation, and an example prediction. This is a reproducible synthetic-data demo.”

## Shot 2 — traffic data (0:10–0:32)
**On screen:** open **Daily traffic forecast**. Show the four data metrics, then expand the raw hourly records and engineered inputs.

**Voice-over:**
“For traffic, we generated 172,536 hourly department-level records across seven departments and 1,027 simulated calendar days. Every row contains an arrival count, not a real patient identity. The second table shows examples of features created from history: the previous hour, the same hour yesterday, the same hour last week, and rolling averages.”

## Shot 3 — traffic model (0:32–0:55)
**On screen:** model comparison table and the selected model / MAE cards. Point at the baseline and Gradient Boosting rows.

**Voice-over:**
“We compare a simple weekly baseline with Ridge regression and Histogram Gradient Boosting. The evaluation uses a later 90-day holdout and rolling one-hour-ahead predictions. On this synthetic test, Gradient Boosting has an MAE of 0.8818 arrivals per hour, compared with 1.2554 for the weekly baseline. That is evidence that the model learns the generated patterns; it is not evidence of real-hospital accuracy.”

## Shot 4 — daily output (0:55–1:12)
**On screen:** next-seven-days chart and table. Move the pointer across several bars. Avoid calling the lowest bar a guaranteed “best day.”

**Voice-over:**
“The forecasting code produces hourly estimates by department. For this view, those estimates are summed into daily totals, so the result is easy to interpret. A lower predicted total can be used as a demo signal for a potentially quieter day, but this sample is not connected to live queue conditions and is not a guarantee.”

## Shot 5 — patient duration dataset and evaluation (1:12–1:39)
**On screen:** switch to **Patient consultation time**. Show the record count, feature list, then the model-vs-baseline metrics and held-out row.

**Voice-over:**
“The second task uses a separate synthetic dataset: 17,813 consultation records across 4,200 fictional patient profiles. Returning visits can include the previous consultation duration and the time since the earlier visit. The model estimates consultation minutes from fields such as department, broad visit-reason group, age, symptom count, visit type, and prior-visit history. On the later-date synthetic holdout, its MAE is 2.26 minutes versus 3.35 minutes for a department-median baseline.”

## Shot 6 — repeat patient and live prediction (1:39–2:03)
**On screen:** select a synthetic profile, show its visit history, then submit **Estimate consultation time**. Keep the estimated minutes visible for a moment.

**Voice-over:**
“This example shows how a previous visit can contribute context for a hypothetical follow-up. The form sends the chosen features to the saved model and returns an estimated consultation duration. It is an estimate of time with the doctor, not the total time waiting in the queue.”

## Shot 7 — responsible close (2:03–2:15)
**On screen:** leave the predicted duration and synthetic-data notice visible.

**Voice-over:**
“Both workflows show the full machine-learning loop: generated records, engineered features, model training, holdout evaluation, and prediction. The current metrics are synthetic-only. Real deployment would require representative hospital data, privacy safeguards, and validation before operational use. The duration model does not diagnose or recommend medicine.”

## Recording checklist

- [ ] Close unrelated windows and browser tabs; maximize the demo browser.
- [ ] Keep the synthetic-data notice visible; do not crop it out.
- [ ] Scroll slowly and pause on the main metrics.
- [ ] Click the estimate button once after filling the duration form.
- [ ] Do not imply that the current website or live queue is connected to this standalone dashboard.
- [ ] Do not call the MAE a guaranteed error for an individual patient; it is an average over the synthetic test set.
