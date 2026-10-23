import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Body, Button, ErrorNote, Input, Screen, Spacer, Title } from '../src/components/ui';
import { AUTH_REDIRECT_URL } from '../src/lib/authLink';
import { humanError, supabase } from '../src/lib/supabase';
import { fonts, radius, useTheme } from '../src/theme';

export default function SignIn() {
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  // автопроверка на 6-й цифре, автоподстановка кода и кнопка «Войти» не должны отправить код дважды
  const verifying = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: AUTH_REDIRECT_URL },
    });
    setBusy(false);
    if (e) return setError(humanError(e));
    setStep('code');
    setCooldown(60);
    setTimeout(() => codeRef.current?.focus(), 300);
  }

  async function verify(value = code) {
    if (value.length !== 6 || verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: value, type: 'email' });
    verifying.current = false;
    setBusy(false);
    if (e) {
      setError(humanError(e));
      setCode('');
    }
    // при успехе Gate сам переведёт на нужный экран
  }

  return (
    <Screen>
      <Spacer h={36} />
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Text style={{ fontSize: 44 }}>🤍</Text>
        <Text style={{ fontSize: 44, marginLeft: -18, marginTop: 8 }}>🧡</Text>
      </View>
      <Title style={{ fontSize: 40, marginTop: 8 }}>Вдвоём</Title>
      <Body muted style={{ marginTop: 6, fontSize: 17, lineHeight: 24 }}>
        Общие списки фильмов, рецептов, планов и мечтаний — для пары или всей семьи.
      </Body>
      <Spacer h={36} />

      {step === 'email' ? (
        <>
          <Input
            label="Электронная почта"
            value={email}
            onChangeText={setEmail}
            placeholder="name@mail.ru"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => validEmail && sendCode()}
          />
          <ErrorNote text={error} />
          <Button title="Получить письмо" onPress={sendCode} loading={busy} disabled={!validEmail} icon="mail-outline" />
          <Body faint style={{ marginTop: 14, fontSize: 13, textAlign: 'center' }}>
            Пароль не нужен — пришлём на почту код или ссылку для входа.
          </Body>
        </>
      ) : (
        <>
          <Body muted>
            Отправили письмо на <Text style={{ color: c.text, fontWeight: '700' }}>{email.trim()}</Text>
          </Body>
          <Body faint style={{ marginTop: 6, fontSize: 13 }}>
            Введи код из письма или просто нажми в нём ссылку на этом телефоне.
          </Body>
          <Spacer h={16} />
          <Pressable
            onPress={() => codeRef.current?.focus()}
            accessibilityLabel={`Код из письма, введено ${code.length} из 6`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}
          >
            {Array.from({ length: 6 }).map((_, i) => {
              const ch = code[i] ?? '';
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    maxWidth: 52,
                    height: 60,
                    borderRadius: radius.md,
                    backgroundColor: c.card,
                    borderWidth: 2,
                    borderColor: active ? c.accent : ch ? c.border : c.bgAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 28, fontWeight: '700', color: c.text, fontFamily: fonts.display }}>{ch}</Text>
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={codeRef}
            value={code}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              if (v.length === 6) verify(v);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
            autoFocus
          />
          <Spacer h={20} />
          <ErrorNote text={error} />
          <Button title="Войти" onPress={() => verify()} loading={busy} disabled={code.length !== 6} />
          <Spacer h={8} />
          <Button
            title={cooldown > 0 ? `Отправить снова через ${cooldown} с` : 'Отправить письмо ещё раз'}
            variant="ghost"
            disabled={cooldown > 0 || busy}
            onPress={sendCode}
          />
          <Button title="Изменить почту" variant="ghost" onPress={() => { setStep('email'); setCode(''); setError(null); }} />
        </>
      )}
    </Screen>
  );
}
