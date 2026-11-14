import { Link } from 'react-router'

const PAGES = {
  about: {
    title: 'About PSG InterviewShare',
    lead: 'A student-run knowledge base of real interview experiences, written by PSG Tech students for their juniors.',
    sections: [
      ['Why it exists', 'Every placement season, the same questions get asked in class groups: what does this company ask, how many rounds, how hard is it? The answers live in scattered chats and disappear every year. PSG InterviewShare keeps them, structured by company, round and topic, so each batch starts where the last one left off.'],
      ['Who runs it', 'PSG InterviewShare is an independent project, built and moderated by PSG Tech students. It is not affiliated with, endorsed by or run by PSG College of Technology or its placement cell, and it doesn’t use the college’s name or logo officially. “PSG” only describes who it is for. Nothing on it is official company information unless it’s explicitly labelled with a source.'],
      ['How moderation works', 'Anyone can report an experience or comment. Content reported by three different students is hidden automatically until a student moderator reviews it. Every moderation and admin action is recorded in an audit log.'],
      ['Contact', 'Questions, corrections or takedown requests: use “Report” on the content, or reach the admins through the Guidelines page. A dedicated contact address will be published before launch.'],
    ],
  },
  guidelines: {
    title: 'Community guidelines',
    lead: 'PSG InterviewShare works because people share honestly. These rules keep it useful and safe.',
    sections: [
      ['Share', 'Your own interview experience: the process, the kinds of questions, how you prepared, and honest advice. Rejections are as valuable as offers.'],
      ['Don’t share', 'Confidential test content you agreed not to disclose, personal details or insults about interviewers or other candidates, experiences that aren’t yours, or anything misleading.'],
      ['Anonymity', 'You can post anonymously. Readers never see who you are. Admins can see the author only to deal with abuse, and every such lookup is logged.'],
      ['Consequences', 'Content that breaks these rules is hidden or removed. Repeated or serious violations lead to suspension.'],
    ],
  },
  privacy: {
    title: 'Privacy',
    lead: 'We collect the minimum needed to keep PSG InterviewShare PSG-only and useful.',
    sections: [
      ['What we collect', 'Your PSG email (to verify you’re a student; never shown to others), name, department, batch, an optional photo, optional interests, and what you choose to post. We don’t collect roll numbers, phone numbers or compensation details.'],
      ['Who sees what', 'Students see your name, department and batch on experiences you post under your name. Anonymous posts show neither. Your saved list, drafts and reading history are visible only to you.'],
      ['Deleting your data', 'You can export your data or delete your account from Settings. When deleting, you choose whether your published experiences are removed or kept anonymously.'],
    ],
  },
  terms: {
    title: 'Terms',
    lead: 'Plain-language terms for using PSG InterviewShare.',
    sections: [
      ['Your content', 'You keep ownership of what you post. By posting, you allow PSG InterviewShare to display it to verified PSG students.'],
      ['No guarantees', 'Experiences are personal accounts. Processes and questions change, so use them as preparation material, not as a promise of what will happen.'],
      ['Access', 'Access is limited to verified PSG Tech students and may be suspended for breaking the community guidelines.'],
      ['Independent project', 'PSG InterviewShare is an independent student project. It is not affiliated with, endorsed by or operated by PSG College of Technology or its placement cell.'],
    ],
  },
}

export default function StaticPage({ page }) {
  const p = PAGES[page]
  return (
    <div className="container-page py-12 md:py-16">
      <article className="container-reading">
        <h1 className="text-h1">{p.title}</h1>
        <p className="mt-3 text-body-lg text-ink-600">{p.lead}</p>
        <div className="mt-10 space-y-8">
          {p.sections.map(([h, body]) => (
            <section key={h}>
              <h2 className="text-h3">{h}</h2>
              <p className="mt-2 text-body-lg text-ink-700">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-ink-200 pt-6 text-small text-ink-500">
          Draft text for the prototype. Final wording will be reviewed before launch. <Link to="/" className="font-medium text-ink-700 hover:underline">Back to home</Link>
        </p>
      </article>
    </div>
  )
}
