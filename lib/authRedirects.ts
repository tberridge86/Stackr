import * as Linking from 'expo-linking';

type AuthParamValue = string | string[] | undefined;

export type AuthLinkParams = {
  access_token?: AuthParamValue;
  code?: AuthParamValue;
  error?: AuthParamValue;
  error_description?: AuthParamValue;
  refresh_token?: AuthParamValue;
  type?: AuthParamValue;
};

const AUTH_CALLBACK_PATH = 'auth/callback';
const RESET_PASSWORD_PATH = 'auth/reset-password';

export function getAuthCallbackRedirectUrl() {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export function getPasswordResetRedirectUrl() {
  return Linking.createURL(RESET_PASSWORD_PATH);
}

export function firstAuthParam(value: AuthParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function mergeAuthLinkParams(
  routeParams: AuthLinkParams,
  urlParams: AuthLinkParams
): AuthLinkParams {
  return {
    access_token: routeParams.access_token ?? urlParams.access_token,
    code: routeParams.code ?? urlParams.code,
    error: routeParams.error ?? urlParams.error,
    error_description: routeParams.error_description ?? urlParams.error_description,
    refresh_token: routeParams.refresh_token ?? urlParams.refresh_token,
    type: routeParams.type ?? urlParams.type,
  };
}

export function getAuthParamsFromUrl(url: string | null | undefined): AuthLinkParams {
  if (!url) return {};

  const params: Record<string, string> = {};

  const addParams = (rawParams: string) => {
    const cleanParams = rawParams.replace(/^[?#]/, '');
    if (!cleanParams) return;

    new URLSearchParams(cleanParams).forEach((value, key) => {
      params[key] = value;
    });
  };

  try {
    const parsedUrl = new URL(url);
    addParams(parsedUrl.search);
    addParams(parsedUrl.hash);
  } catch {
    const queryIndex = url.indexOf('?');
    const hashIndex = url.indexOf('#');

    if (queryIndex >= 0) {
      addParams(url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined));
    }
    if (hashIndex >= 0) {
      addParams(url.slice(hashIndex + 1));
    }
  }

  return params;
}
