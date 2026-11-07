import { createHash } from 'crypto';

/**
 * Datos de quien opera Kahal. Se muestran en la política y en el contrato:
 * una vez publicados, cambiarlos exige subir la versión de ambos documentos.
 */
export const OPERATOR = {
  name: 'Maximiliano Ariel Giovine',
  taxId: 'CUIL 20-44291958-6',
  address: 'Diagonal 12 4679, Sauce Viejo, Santa Fe, Argentina',
  email: 'maxiagiovine@gmail.com',
  courts: 'la ciudad de Santa Fe, provincia de Santa Fe, Argentina',
  hosting: 'Hetzner, con servidores en Helsinki, Finlandia',
};

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  key: 'privacy' | 'contract';
  title: string;
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export const RETENTION = {
  /** Registros sin terminar: solicitudes y cuentas sin aprobar o sin estrenar. */
  unfinishedDays: 30,
  /** Tiempo para arrepentirse o exportar datos antes de borrar una iglesia. */
  churchGraceDays: 30,
  /** Plazo general de prescripción del Código Civil y Comercial argentino (art. 2560). */
  agreementYears: 5,
  /** Lo que tarda en desaparecer un dato de las copias de seguridad. */
  backupMonths: 6,
};

export const PRIVACY: LegalDocument = {
  key: 'privacy',
  title: 'Política de Privacidad',
  version: '1.1',
  effectiveDate: '2026-11-07',
  sections: [
    {
      title: '1. Quién trata tus datos',
      paragraphs: [
        `Kahal es una plataforma de gestión de iglesias operada por ${OPERATOR.name} (${OPERATOR.taxId}), con domicilio en ${OPERATOR.address}. Contacto de privacidad: ${OPERATOR.email}.`,
        'Cada iglesia decide qué datos de sus miembros registra y para qué, por lo que es responsable de esos datos. Kahal los trata por encargo de la iglesia. Kahal es responsable solo de lo necesario para administrar la plataforma: las cuentas, las solicitudes de alta y la seguridad.',
        'Esta política se rige por la Ley 25.326 de Protección de Datos Personales de la República Argentina. Si vives en otro país, también pueden corresponderte los derechos que te reconozca su legislación.',
      ],
    },
    {
      title: '2. Qué datos tratamos',
      paragraphs: [
        'Datos de tu cuenta: nombre, apellido, correo, teléfono, contraseña protegida con un algoritmo de hash y, si la usas, tu identificación de Google o Apple.',
        'Datos de tu ficha en la iglesia: documento, fecha de nacimiento, dirección, foto, género, familia, ministerios, estados, fechas de ingreso y de bautismo, notas de la iglesia y aportes o movimientos asociados a tu persona.',
        'Datos de citas: fecha, persona con la que te reúnes, motivo y notas. Te recomendamos no escribir en el motivo información de salud u otros detalles delicados.',
        'Datos técnicos: cookies necesarias para mantener tu sesión y, si activas los avisos, el identificador de tu dispositivo para enviarlos. No usamos publicidad ni herramientas de seguimiento de terceros.',
        'Cuando esté habilitada la suscripción: datos de quien la gestiona, importe, moneda, fechas y estado de los pagos, e identificadores que entrega la pasarela. Los números de tarjeta los trata la pasarela y Kahal no los recibe.',
        'Quien solicita el alta de una iglesia aporta además los datos del formulario y su aceptación del contrato, incluidos la dirección IP y el navegador usados, como constancia.',
        'Si quien administra la iglesia conecta su página de Facebook: el identificador y el nombre de la página, quién la conectó y la credencial de acceso a la página que entrega Facebook, que guardamos cifrada. Al conectarla, Facebook nos muestra las páginas que administra esa persona para que elija la de la iglesia: no guardamos las demás. Usamos esa credencial solo para saber cuándo la página transmite en vivo y mostrar la transmisión en la iglesia. No publicamos nada en Facebook ni accedemos al perfil, los contactos ni los mensajes de nadie.',
      ],
    },
    {
      title: '3. Datos sensibles',
      paragraphs: [
        'Pertenecer a una iglesia o estar bautizado puede revelar tus creencias religiosas, que la ley considera datos sensibles. Por eso solo los tratamos con tu autorización expresa o cuando la ley lo permite, como el registro de miembros que pueden llevar las asociaciones religiosas.',
        'Nadie puede obligarte a proporcionar datos sensibles. Puedes no responder si estás bautizado, tanto al registrarte como en tu perfil.',
      ],
    },
    {
      title: '4. Para qué los usamos',
      paragraphs: [
        'Para crear y proteger tu cuenta; para que tu iglesia gestione su membresía, actividades, citas, contenido y finanzas; para enviarte avisos y correos del servicio; para gestionar la suscripción de las iglesias; para responder consultas, y para cumplir obligaciones legales o defender derechos en caso de reclamo.',
        'No vendemos tus datos ni los usamos para publicidad. No tomamos decisiones automatizadas que te afecten de forma significativa.',
      ],
    },
    {
      title: '5. Quién puede verlos',
      paragraphs: [
        'Dentro de tu iglesia, las personas con permisos según su rol. Quienes administran Kahal pueden acceder cuando sea necesario para soporte, seguridad o por obligación legal.',
        `Proveedores que hacen posible el servicio: alojamiento (${OPERATOR.hosting}), correo electrónico, almacenamiento de archivos y las pasarelas de pago de cada país; Google o Apple si ingresas con ellos; Meta (Facebook) si tu iglesia conecta su página; los servicios de avisos de Apple, Google o Mozilla si los activas, y YouTube, Facebook o Twitch si abres una transmisión, ya que esas plataformas pueden recibir tus datos de navegación.`,
        'Algunos proveedores pueden estar fuera de tu país, en lugares con un nivel de protección diferente. Al aceptar esta política, autorizas esas transferencias en la medida necesaria para prestar el servicio.',
        'También podemos entregar datos si lo ordena una autoridad competente.',
      ],
    },
    {
      title: '6. Cuánto tiempo los conservamos',
      paragraphs: [
        'Tu cuenta y tu ficha: hasta que elimines la cuenta, tu iglesia la elimine o se borre la iglesia.',
        `Solicitudes de alta y cuentas sin terminar: ${RETENTION.unfinishedDays} días. Se borran las solicitudes sin resolver o ya resueltas, las cuentas pendientes o rechazadas y las cuentas creadas por una iglesia que nunca se usaron.`,
        `Iglesias: al pedir la baja hay ${RETENTION.churchGraceDays} días para cancelarla o exportar la información. Después se borran sus datos y archivos.`,
        `Constancia del contrato de una iglesia: ${RETENTION.agreementYears} años desde que finaliza la relación, para atender posibles reclamos. Si la solicitud se rechaza o vence, se borra con ella.`,
        'Datos de suscripción y pagos: el tiempo que exijan las normas fiscales y contables, aunque se borre la iglesia.',
        'Conexión con la página de Facebook: hasta que la iglesia la desconecte o se borre la iglesia. Al desconectarla, se borra la credencial.',
        `Copias de seguridad: lo borrado puede permanecer en ellas hasta ${RETENTION.backupMonths} meses, protegido y sin uso activo, hasta que se reemplacen.`,
        'Si se elimina tu cuenta, los movimientos financieros de la iglesia se conservan sin vincularlos a tu persona, porque forman parte de su contabilidad. Pueden quedar en el registro de actividad los títulos del contenido que publicaste.',
      ],
    },
    {
      title: '7. Tus derechos',
      paragraphs: [
        'Puedes pedir acceso a tus datos, corregirlos, actualizarlos o suprimirlos, y retirar tu autorización. Puedes corregirlos en Mi perfil y eliminar tu cuenta desde allí, salvo que seas la única persona que administra una iglesia. Para todo lo demás, o si tu iglesia tiene el acceso bloqueado por falta de pago, escribe a tu iglesia o a ' + OPERATOR.email + '.',
        'Para borrar los datos de una página de Facebook conectada, quien administra la iglesia puede desconectarla en Configuración → Iglesia. También puedes quitarle el acceso a Kahal desde Facebook, en Configuración y privacidad → Configuración → Integraciones comerciales, o escribirnos a ' + OPERATOR.email + ' para que la borremos nosotros.',
        'Respondemos los pedidos de acceso en un máximo de 10 días corridos y los de corrección o supresión en un máximo de 5 días hábiles. La supresión no procede si lesiona derechos de terceros o si una ley obliga a conservar el dato.',
        'El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley 25.326.',
        'La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.',
      ],
    },
    {
      title: '8. Menores de edad',
      paragraphs: [
        'Para crear una cuenta debes ser mayor de 18 años o contar con la autorización de tu madre, padre o tutor. Si eres responsable de un menor y crees que registró datos sin tu autorización, escríbenos para eliminarlos.',
        'La iglesia que registre datos de menores debe contar con la autorización de quien los representa y tratarlos en función de su interés superior.',
      ],
    },
    {
      title: '9. Seguridad',
      paragraphs: [
        'Aplicamos medidas como contraseñas protegidas, sesiones seguras, permisos por rol y datos separados por iglesia. Ningún sistema es infalible. Si un incidente pudiera afectar tus derechos, lo comunicaremos sin demora a la iglesia, a las personas afectadas y a la autoridad cuando corresponda.',
      ],
    },
    {
      title: '10. Cambios',
      paragraphs: [
        'Si cambiamos esta política, publicaremos la nueva versión aquí y avisaremos por un medio razonable cuando el cambio sea importante. Se guarda la versión que aceptó cada persona.',
      ],
    },
  ],
};

export const CONTRACT: LegalDocument = {
  key: 'contract',
  title: 'Contrato de uso de Kahal para iglesias',
  version: '1.1',
  effectiveDate: '2026-11-06',
  sections: [
    {
      title: '1. Partes y aceptación',
      paragraphs: [
        `Este contrato se celebra entre ${OPERATOR.name} (${OPERATOR.taxId}), con domicilio en ${OPERATOR.address} ("Kahal"), y la iglesia indicada en el formulario de alta ("la Iglesia"), representada por quien lo completa.`,
        'Quien marca la casilla de aceptación y envía el formulario manifiesta su conformidad con este texto y declara que los datos aportados son verdaderos y que tiene facultades para obligar a la Iglesia. Si no las tiene, responde personalmente por esa declaración.',
        'El contrato comienza cuando Kahal aprueba la solicitud. Si la rechaza o la solicitud vence, no produce efectos.',
      ],
    },
    {
      title: '2. El servicio',
      paragraphs: [
        'Kahal brinda a la Iglesia un software en línea para gestionar miembros, finanzas, contenido, actividades, transmisiones y citas. Kahal no procesa los diezmos, ofrendas u otros cobros de la Iglesia ni custodia sus fondos: sus registros financieros son solo informativos y no reemplazan su contabilidad ni sus obligaciones fiscales.',
        'Kahal puede modificar o discontinuar funciones. Si un cambio afecta de forma sustancial al servicio, avisará con una anticipación razonable.',
      ],
    },
    {
      title: '3. Suscripción',
      paragraphs: [
        'El uso de Kahal requiere una suscripción mensual a cargo de la Iglesia. La Iglesia elige voluntariamente el importe, que no puede ser inferior a 20.000 pesos argentinos si paga con Mercado Pago ni a 15 dólares estadounidenses si paga con PayPal, y puede cambiarlo para los períodos siguientes. Todos los importes dan acceso a las mismas funciones. El pago retribuye el servicio y no constituye una donación.',
        'El cobro se hace cada mes por adelantado, a través de pasarelas de pago de terceros, que tienen sus propias condiciones: Mercado Pago, en pesos argentinos, para las iglesias de Argentina, y PayPal, en dólares estadounidenses, para las de otros países. Kahal no recibe ni guarda los números de tarjeta.',
        'La Iglesia puede cancelar la suscripción en cualquier momento: la cancelación rige para el período siguiente y no da derecho a devolver lo ya pagado, salvo el derecho de arrepentimiento u otro que la ley le reconozca. Kahal avisará con al menos 30 días si cambia los importes mínimos o estas condiciones.',
        'Una Iglesia nueva debe activar la suscripción para empezar a usar el servicio. Si vence un período sin que se acredite el pago, Kahal puede bloquear temporalmente el acceso de la Iglesia y de todos sus usuarios, tras avisar a quien la administra. El acceso se restablece al acreditarse el pago de un nuevo período, y los meses bloqueados no generan deuda. Si el bloqueo continúa durante 90 días, Kahal puede dar por terminado el contrato y aplicar la baja prevista en la cláusula 6. Mientras Kahal no ofrezca un medio de pago para el país de la Iglesia, puede usar el servicio sin abonar la suscripción.',
      ],
    },
    {
      title: '4. Obligaciones de la Iglesia',
      paragraphs: [
        'Usar el servicio de forma lícita; mantener sus credenciales seguras y asignar los permisos con cuidado; responder por lo que hagan sus usuarios, y exportar y resguardar la información que deba conservar.',
        'Es responsable del contenido que publica o transmite, incluidos los derechos de autor de textos, imágenes y música, y de no difundir contenido ilícito. Kahal puede retirar contenido o suspender cuentas ante un uso ilícito o un riesgo para la seguridad.',
      ],
    },
    {
      title: '5. Protección de datos personales',
      paragraphs: [
        'Respecto de los datos de sus miembros y visitantes, la Iglesia es responsable del tratamiento y Kahal actúa como prestador de servicios conforme al artículo 25 de la Ley 25.326.',
        'La Iglesia garantiza que tiene base legal para registrar esos datos, incluidos los que revelan convicciones religiosas y los de menores, que cuenta con las autorizaciones necesarias y que atenderá los pedidos de sus titulares.',
        'Kahal se compromete a: tratar esos datos solo para prestar el servicio y según las instrucciones de la Iglesia; no cederlos ni usarlos para otros fines; aplicar medidas de seguridad razonables; exigir a sus proveedores obligaciones equivalentes; colaborar con los pedidos de los titulares, y avisar sin demora de un incidente que afecte esos datos.',
        'La Iglesia autoriza a Kahal a usar proveedores de alojamiento, correo y almacenamiento, incluso fuera de su país, según se detalla en la Política de Privacidad. Quienes administran Kahal solo accederán a los datos cuando sea necesario para soporte, seguridad o cumplimiento legal.',
      ],
    },
    {
      title: '6. Plazo y baja',
      paragraphs: [
        'El contrato no tiene plazo fijo. Quien administra la Iglesia puede pedir la baja desde la configuración, y Kahal puede resolverlo con 30 días de aviso, o de inmediato si hay un incumplimiento grave o un riesgo legal o de seguridad. La falta de pago se rige por la cláusula 3.',
        `Desde el pedido de baja hay ${RETENTION.churchGraceDays} días para cancelarla o exportar la información. Si la Iglesia está bloqueada por falta de pago, para exportar debe primero pagar un nuevo período. Vencido ese plazo, Kahal borra los datos y archivos de la Iglesia, sin perjuicio de que permanezcan hasta ${RETENTION.backupMonths} meses en copias de seguridad.`,
        `Kahal conserva la constancia de este contrato durante ${RETENTION.agreementYears} años desde que termina, para atender posibles reclamos.`,
      ],
    },
    {
      title: '7. Disponibilidad y responsabilidad',
      paragraphs: [
        'El servicio se ofrece en el estado en que se encuentra. Kahal procura que funcione de forma continua y segura, pero no garantiza que esté libre de interrupciones o errores.',
        'En la medida que la ley lo permita, Kahal no responde por lucro cesante ni daños indirectos, ni por el contenido o los actos de la Iglesia y de sus usuarios. Esta limitación no se aplica en casos de dolo o culpa grave, ni a derechos que la ley declare irrenunciables.',
        'La Iglesia mantendrá indemne a Kahal frente a reclamos de terceros causados por el contenido que publique o por haber registrado datos sin base legal.',
      ],
    },
    {
      title: '8. Propiedad intelectual',
      paragraphs: [
        'El software y la marca Kahal pertenecen a su titular. La Iglesia conserva sus datos y contenidos, y autoriza a Kahal a alojarlos y mostrarlos solo para prestar el servicio.',
      ],
    },
    {
      title: '9. Cambios del contrato',
      paragraphs: [
        'Kahal avisará con al menos 30 días los cambios importantes. Si la Iglesia no está de acuerdo, puede dar de baja el servicio antes de que se apliquen. Se conserva la versión aceptada en cada caso.',
      ],
    },
    {
      title: '10. Ley aplicable y jurisdicción',
      paragraphs: [
        `Este contrato se rige por las leyes de la República Argentina. Para cualquier conflicto, las partes se someten a los tribunales ordinarios de ${OPERATOR.courts}, salvo que una norma imperativa disponga otra cosa. Las comunicaciones se envían al correo informado en el formulario y a ${OPERATOR.email}.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = { privacy: PRIVACY, contract: CONTRACT };

/** Texto exacto del documento, tal como queda guardado en cada constancia. */
export function documentText(doc: LegalDocument) {
  const body = doc.sections.map((s) => `${s.title}\n\n${s.paragraphs.join('\n\n')}`).join('\n\n');
  return `${doc.title}\nVersión ${doc.version}, vigente desde ${doc.effectiveDate}\n\n${body}`;
}

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
