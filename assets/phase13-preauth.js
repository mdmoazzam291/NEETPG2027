(() => {
  'use strict';
  if (window.__NEETPG_PHASE13_PREAUTH__) return;
  window.__NEETPG_PHASE13_PREAUTH__ = true;

  let cloudValue;
  Object.defineProperty(window, 'NEETPG_CLOUD', {
    configurable: true,
    enumerable: true,
    get(){ return cloudValue; },
    set(value){
      cloudValue = value;
      if (!value || value.__phase13Prepared) return;
      value.__phase13Prepared = true;

      let clientValue = value.client || null;
      Object.defineProperty(value, 'client', {
        configurable: true,
        enumerable: true,
        get(){ return clientValue; },
        set(client){
          clientValue = client;
          if (!client || client.__neetpgActiveSessionGuard) return;

          const rawFrom = client.from.bind(client);
          Object.defineProperty(client, '__neetpgRawFrom', { value: rawFrom, configurable: false, enumerable: false });

          client.from = function(table){
            const builder = rawFrom(table);
            if (table === 'active_sessions' && builder && typeof builder.delete === 'function') {
              const rawDelete = builder.delete.bind(builder);
              builder.delete = function(...args){
                if (window.__NEETPG_ALLOW_ACTIVE_SESSION_DELETE__) return rawDelete(...args);
                return {
                  eq: async () => ({ data: null, error: null, count: 0, status: 204, statusText: 'No Content' })
                };
              };
            }
            return builder;
          };

          client.__neetpgActiveSessionGuard = true;
          value.clearActiveSession = async function(){
            if (!value.user) return;
            window.__NEETPG_ALLOW_ACTIVE_SESSION_DELETE__ = true;
            try {
              const { error } = await rawFrom('active_sessions').delete().eq('user_id', value.user.id);
              if (error) throw error;
              value.resumePayload = null;
              const host = document.getElementById('cloudResume');
              if (host) host.innerHTML = '';
            } finally {
              window.__NEETPG_ALLOW_ACTIVE_SESSION_DELETE__ = false;
            }
          };
        }
      });
    }
  });
})();
