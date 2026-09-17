import type { $Fetch, FetchOptions, FetchResponse } from 'ofetch'

export type ApiFetchOptions = FetchOptions<any> & { responseType?: any }

export interface ApiFetchInstance {
  $get: (_url: string, _options?: ApiFetchOptions) => Promise<any>
  $post: (_url: string, _options?: ApiFetchOptions) => Promise<any>
  $put: (_url: string, _options?: ApiFetchOptions) => Promise<any>
  $patch: (_url: string, _options?: ApiFetchOptions) => Promise<any>
  $delete: (_url: string, _options?: ApiFetchOptions) => Promise<any>
  get: (_url: string, _options?: ApiFetchOptions) => Promise<FetchResponse<any>>
  post: (_url: string, _options?: ApiFetchOptions) => Promise<FetchResponse<any>>
  put: (_url: string, _options?: ApiFetchOptions) => Promise<FetchResponse<any>>
  patch: (_url: string, _options?: ApiFetchOptions) => Promise<FetchResponse<any>>
  delete: (_url: string, _options?: ApiFetchOptions) => Promise<FetchResponse<any>>
  request: (_url: string, _options?: ApiFetchOptions) => Promise<any>
  raw: (_url: string, _options?: ApiFetchOptions) => Promise<FetchResponse<any>>
}

/**
 * Keeps the `$get`/`get` call shape the application already uses so moving the
 * transport to the Nitro proxy does not touch every caller.
 */
export function createApiFetchInstance(client: $Fetch): ApiFetchInstance {
  const data = (method: string) =>
    (url: string, options: ApiFetchOptions = {}) => client(url, { ...options, method } as any)
  const raw = (method: string) =>
    (url: string, options: ApiFetchOptions = {}) => client.raw(url, { ...options, method } as any)

  return {
    $get: data('GET'),
    $post: data('POST'),
    $put: data('PUT'),
    $patch: data('PATCH'),
    $delete: data('DELETE'),
    get: raw('GET'),
    post: raw('POST'),
    put: raw('PUT'),
    patch: raw('PATCH'),
    delete: raw('DELETE'),
    request: (url, options = {}) => client(url, options as any),
    raw: (url, options = {}) => client.raw(url, options as any)
  }
}
