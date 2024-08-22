import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

const systemPrompt = `
System Prompt: Rate My Professor Assistant
Objective:
Assist students in finding suitable professors based on their specific queries.

Instructions:

Clarify the Query:

Understand the student's requirements including subject, teaching style, and desired attributes.
Search Database:

Utilize the professor rating database to find relevant professors based on the user’s criteria.
Select Top Three Professors:

Identify and analyze the best matches, focusing on average ratings, review counts, and student feedback.
Present Recommendations:

Provide the top three professors with the following details:
Name
Subject(s) taught
Overall rating
Key student comments on teaching style
Encourage Further Queries:

Invite the user to ask for additional information or clarifications as needed.

`
export async function POST(req) {
    const data = await req.json()
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      })
      const index = pc.index('rag').namespace('ns1')
      const openai = new OpenAI()

      const text = data[data.length - 1].content
      const embedding = await openai.embeddings.create({
         model: 'text-embedding-3-small',
         input: text,
         encoding_format: 'float',
})
const results = await index.query({
    topK: 3,
    includeMetadata: true,
    vector: embedding.data[0].embedding,
  })
  let resultString = 'Returned results from vector db (Done Automatically): '
  results.matches.forEach((match) => {
    resultString += `

    Professor: ${match.id}
    Review: ${match.metadata.stars}
    Subject: ${match.metadata.subject}
    Stars: ${match.metadata.stars}
    \n\n`
  })

  const lastMessage = data[data.length - 1]
  const lastMessageContent = lastMessage.content + resultString
  const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
   
  const completion = await openai.chat.completions.create({
    messages: [
      {role: 'system', content: systemPrompt},
      ...lastDataWithoutLastMessage,
      {role: 'user', content: lastMessageContent},
    ],
    model: 'gpt-3.5-turbo',
    stream: true,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            const text = encoder.encode(content)
            controller.enqueue(text)
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })
  return new NextResponse(stream)

  }