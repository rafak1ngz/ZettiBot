// src/types/next.d.ts
declare module 'next' {
  export type NextApiRequest = import('next/server').NextRequest & {
    body: any;
    query: { [key: string]: string | string[] };
    cookies: { [key: string]: string };
  };
  
  export type NextApiResponse = import('next/server').NextResponse & {
    status(code: number): NextApiResponse;
    json(data: any): void;
    end(): void;
  };
}