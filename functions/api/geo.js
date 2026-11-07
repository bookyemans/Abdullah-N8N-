export async function onRequestGet({ request }) {
  const cf = request.cf || {};
  const data = {
    country: typeof cf.country === 'string' ? cf.country : '-',
    city: typeof cf.city === 'string' ? cf.city : '-'
  };
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, max-age=600',
      'vary': 'Cookie'
    }
  });
}
