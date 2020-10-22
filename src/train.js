/* Generic machine learning handlers that route to the selected trainer. */

import SVMTrainer from "./trainers/SVMTrainer";
import KNNTrainer from "./trainers/KNNTrainer";
import RFTrainer from "./trainers/RFTrainer";
import { store } from "./index.js";
import ColumnTypes, {
  getUniqueOptions,
  getCategoricalColumns,
  getSelectedCategoricalColumns,
  setFeatureNumberKey,
  setTrainingExamples,
  setTrainingLabels,
  setAccuracyCheckExamples,
  setAccuracyCheckLabels
} from "./redux";

export const MLTypes = {
  CLASSIFICATION: "classification",
  REGRESSION: "regression"
};

export const availableTrainers = {
  binarySvm: {
    name: "Binary SVM",
    description:
      "Uses the Support Vector Machine algorithm to classify an example as one of two options.",
    mlType: MLTypes.CLASSIFICATION,
    binary: true,
    supportedFeatureTypes: [ColumnTypes.CATEGORICAL, ColumnTypes.CONTINUOUS],
    labelType: ColumnTypes.CATEGORICAL
  },
  knn: {
    name: "KNN",
    description:
      "Uses the K-Nearest Neighbor algorithm to classify an example as one of N options. K is currently set to 2, but this is customizable.",
    mlType: MLTypes.CLASSIFICATION,
    binary: false,
    supportedFeatureTypes: [ColumnTypes.CATEGORICAL, ColumnTypes.CONTINUOUS],
    labelType: ColumnTypes.CATEGORICAL
  },
  randomForest: {
    name: "Random Forest",
    description:
      "Uses Random Forest ensemble learning to predict a continuous data label.",
    mlType: MLTypes.REGRESSION,
    binary: false,
    supportedFeatureTypes: [ColumnTypes.CATEGORICAL, ColumnTypes.CONTINUOUS],
    labelType: ColumnTypes.CONTINUOUS
  }
};

const filterTrainersByType = type => {
  let trainersOfType = {};
  const trainerKeys = Object.keys(availableTrainers).filter(
    trainerKey => availableTrainers[trainerKey].mlType === type
  );
  trainerKeys.forEach(
    trainerKey => (trainersOfType[trainerKey] = availableTrainers[trainerKey])
  );
  return trainersOfType;
};

export const getClassificationTrainers = () => {
  return filterTrainersByType(MLTypes.CLASSIFICATION);
};

export const getRegressionTrainers = () => {
  return filterTrainersByType(MLTypes.REGRESSION);
};

/* Builds a hash that maps a feature's categorical options to numbers because
  the ML algorithms only accept numerical inputs.
  @param {string} - feature name
  @return {
    option1 : 0,
    option2 : 1,
    option3: 2,
    ...
  }
  */
const buildOptionNumberKey = (state, feature) => {
  let optionsMappedToNumbers = {};
  const uniqueOptions = getUniqueOptions(state, feature);
  uniqueOptions.forEach(
    option => (optionsMappedToNumbers[option] = uniqueOptions.indexOf(option))
  );
  return optionsMappedToNumbers;
};

/* Builds a hash that maps selected categorical features to their option-
  number keys and dispatches that hash to the Redux store.
  @return {
    feature1: {
      option1 : 0,
      option2 : 1,
      option3: 2,
      ...
    },
    feature2: {
      option1 : 0,
      option2 : 1,
      ...
    }
  }
  */

const buildOptionNumberKeysByFeature = state => {
  let optionsMappedToNumbersByFeature = {};
  const categoricalColumnsToConvert = getSelectedCategoricalColumns(
    state
  ).concat(state.labelColumn);
  categoricalColumnsToConvert.forEach(
    feature =>
      (optionsMappedToNumbersByFeature[feature] = buildOptionNumberKey(
        state,
        feature
      ))
  );
  store.dispatch(setFeatureNumberKey(optionsMappedToNumbersByFeature));
};

/* For feature columns that store categorical data, looks up the value
  associated with a row's specific option for a given feature; otherwise
  returns the option converted to an integer for feature columns that store
  continuous data.
  @param {object} row, entry from the dataset
  {
    labelColumn: option,
    featureColumn1: option,
    featureColumn2: option
    ...
  }
  @param {string} - feature name
  @return {integer}
  */
const convertValue = (state, feature, row) => {
  return getCategoricalColumns(state).includes(feature)
    ? state.featureNumberKey[feature][row[feature]]
    : parseFloat(row[feature]);
};

/* Builds an array containing integer values associated with each feature's
  specific option in a given row.
  @param {object} row, entry from the dataset
  {
    labelColumn: option,
    featureColumn1: option,
    featureColumn2: option
    ...
  }
  @return {array}
  */
const extractExamples = (state, row) => {
  let exampleValues = [];
  state.selectedFeatures.forEach(feature =>
    exampleValues.push(convertValue(state, feature, row))
  );
  return exampleValues.filter(
    label => label !== undefined && label !== "" && !isNaN(label)
  );
};

const extractLabel = (state, row) => {
  return convertValue(state, state.labelColumn, row);
};

const getRandomInt = max => {
  return Math.floor(Math.random() * Math.floor(max));
};

const prepareTrainingData = () => {
  const updatedState = store.getState();
  const trainingExamples = updatedState.data
    .map(row => extractExamples(updatedState, row))
    .filter(example => example.length > 0 && example !== undefined);
  const trainingLabels = updatedState.data
    .map(row => extractLabel(updatedState, row))
    .filter(label => label !== undefined && label !== "" && !isNaN(label));
  // Randomly select 10% of examples and corresponding labels from the training // set to reserve for a post-training accuracy calculation. The accuracy check
  // examples and labels are excluded from the training set when the model is
  // trained and saved to state separately to test the model's accuracy.
  const accuracyCheckExamples = [];
  const accuracyCheckLabels = [];
  const numToReserve = parseInt(trainingExamples.length * 0.1);
  let numReserved = 0;
  while (numReserved < numToReserve) {
    let randomIndex = getRandomInt(trainingExamples.length - 1);
    accuracyCheckExamples.push(trainingExamples[randomIndex]);
    trainingExamples.splice(randomIndex, 1);
    accuracyCheckLabels.push(trainingLabels[randomIndex]);
    trainingLabels.splice(randomIndex, 1);
    numReserved++;
  }
  store.dispatch(setTrainingExamples(trainingExamples));
  store.dispatch(setTrainingLabels(trainingLabels));
  store.dispatch(setAccuracyCheckExamples(accuracyCheckExamples));
  store.dispatch(setAccuracyCheckLabels(accuracyCheckLabels));
};

const prepareTestData = () => {
  const updatedState = store.getState();
  let testValues = [];
  updatedState.selectedFeatures.forEach(feature =>
    testValues.push(convertValue(updatedState, feature, updatedState.testData))
  );
  return testValues;
};

let trainingState = {};
const init = () => {
  const state = store.getState();
  let trainer;
  switch (state.selectedTrainer) {
    case "binarySvm":
      trainer = new SVMTrainer();
      break;
    case "knn":
      trainer = new KNNTrainer();
      break;
    case "randomForest":
      trainer = new RFTrainer();
      break;
  }
  trainingState.trainer = trainer;
  buildOptionNumberKeysByFeature(state);
  prepareTrainingData();
};

const onClickTrain = () => {
  trainingState.trainer.startTraining();
};

const onClickPredict = () => {
  const testValues = prepareTestData();
  trainingState.trainer.predict(testValues);
};

export default {
  init,
  onClickTrain,
  onClickPredict
};
