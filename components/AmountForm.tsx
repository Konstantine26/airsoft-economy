import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextField } from './TextField';
import { Button } from './Button';

type Props = {
  placeholder?: string;
  buttonLabel?: string;
  onSubmit: (amount: number) => void;
};

export function AmountForm({ placeholder = 'Сумма', buttonLabel = 'Пополнить', onSubmit }: Props) {
  const [amount, setAmount] = useState('');

  const submit = () => {
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    onSubmit(numeric);
    setAmount('');
  };

  return (
    <View style={styles.row}>
      <TextField
        style={styles.input}
        placeholder={placeholder}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Button title={buttonLabel} onPress={submit} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    paddingVertical: 7,
    fontSize: 12.5,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 0,
    justifyContent: 'center',
  },
});
