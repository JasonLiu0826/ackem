const queues=new Map<string,string[]>()
export function enqueueSocialEcho(root:string,text:string){const q=queues.get(root)??[];q.push(text);queues.set(root,q.slice(-20))}
export function consumeSocialEchoes(root:string){const q=queues.get(root)??[];queues.set(root,[]);return q}
