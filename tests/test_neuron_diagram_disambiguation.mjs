import test from 'node:test';
import assert from 'node:assert/strict';

function disambiguateDiagramType(type = '', title = '', code = '') {
  const lower = (type || '').toLowerCase();
  const lowerCode = (code || '').toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  const fullContext = `${lower} ${lowerTitle} ${lowerCode}`;

  if (lower.includes('atom') || lowerCode.includes('type: atom') || lowerCode.includes('bohr')) return 'atom';
  if (lower.includes('molecule') || lowerCode.includes('type: molecule') || lowerCode.includes('benzene') || lowerCode.includes('water')) return 'molecule';

  // Disambiguate Biological Neuroanatomy vs Machine Learning Artificial Neural Networks
  const isBioNeuron =
    /neuron|biological|nervous|glial|glia|soma|axon|dendrite|myelin|ranvier|synapse|schwann|astrocyte|neurotransmitter|saltatory|action\s*potential|membrane\s*potential/i.test(fullContext) &&
    !/deep\s*learning|perceptron|artificial|mlp|backprop|cnn|rnn|layer\s*weights|epoch|training\s*loss/i.test(fullContext);

  if (
    isBioNeuron ||
    lower.includes('biological-neuron') ||
    lower.includes('neuron') ||
    lowerCode.includes('type: biological-neuron') ||
    lowerCode.includes('type: neuron')
  ) {
    return 'biological-neuron';
  }

  if (fullContext.includes('neural') || lowerCode.includes('type: neural')) return 'neural-net';
  return 'other';
}

test('Disambiguation routes biological neuroanatomy to biological-neuron', () => {
  // Case 1: The exact prompt/text that failed in user screenshot
  const result1 = disambiguateDiagramType(
    'visual-diagram',
    'Cellular Architecture of the Nervous System',
    'The nervous system consists of two primary cell types: neurons and glial cells.'
  );
  assert.equal(result1, 'biological-neuron', 'Must route to biological-neuron, not neural-net');

  // Case 2: Action potential and myelin sheath
  const result2 = disambiguateDiagramType(
    '',
    'Action Potential & Saltatory Conduction',
    'Saltatory conduction across nodes of Ranvier and myelin sheaths'
  );
  assert.equal(result2, 'biological-neuron');

  // Case 3: Explicit type: biological-neuron
  const result3 = disambiguateDiagramType('visual-diagram', '', 'type: biological-neuron');
  assert.equal(result3, 'biological-neuron');
});

test('Disambiguation routes machine learning neural networks to neural-net', () => {
  // Case 1: Deep Neural Network Topology
  const result1 = disambiguateDiagramType(
    'visual-diagram',
    'Deep Neural Network Topology',
    'Input Layer x_1, Hidden Layer h_1, Output Layer y_hat, backprop'
  );
  assert.equal(result1, 'neural-net', 'ML network must route to neural-net');

  // Case 2: Perceptron MLP with weights
  const result2 = disambiguateDiagramType(
    'neural-net',
    'Multilayer Perceptron',
    'weights W and biases b trained with gradient descent'
  );
  assert.equal(result2, 'neural-net');
});
